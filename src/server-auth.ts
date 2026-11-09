import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {NineError, normalizeIssuer} from '@9in/sdk/server';
import {verifyIdToken} from './id-token';

/**
 * Server-side sign-in for web apps (Express, Fastify, Next.js API routes, …): the
 * authorization code flow with PKCE, as a confidential client when you pass a secret.
 * `NineAuth` from @9in/sdk is the browser counterpart.
 *
 *   const auth = new ServerAuth({issuer, clientId, clientSecret, redirectUri});
 *
 *   // GET /login
 *   const {url, pending} = await auth.createLogin({returnTo: '/dashboard'});
 *   req.session.nineLogin = pending;
 *   res.redirect(url);
 *
 *   // GET /callback
 *   const tokens = await auth.handleCallback(req.originalUrl, req.session.nineLogin);
 *   req.session.nineLogin = undefined;
 *   req.session.tokens = tokens;
 */

export interface ServerAuthOptions {
    /** Your tenant's issuer, e.g. https://acme.9in.io or your custom login domain. */
    issuer: string;
    clientId: string;
    /** Confidential clients authenticate with client_secret_basic. */
    clientSecret?: string;
    redirectUri?: string;
    /** Default: "openid profile email offline_access". */
    scope?: string;
    /** API identifier to request access tokens for (aud claim). */
    audience?: string;
    /** Language of the hosted pages (ui_locales). */
    locale?: string;
    /** Seconds a started login stays valid (default 3600). */
    loginTimeout?: number;
    /** Accept a plain-http issuer other than localhost (development only). */
    allowInsecureIssuer?: boolean;
    fetch?: typeof fetch;
}

export interface ServerLoginOptions {
    returnTo?: string;
    redirectUri?: string;
    prompt?: 'login' | 'consent' | 'none' | 'select_account';
    loginHint?: string;
    /** "signup" opens the registration form (prompt=create). */
    screen?: 'login' | 'signup';
    params?: Record<string, string>;
}

/** Keep it in the user's session between createLogin() and handleCallback(). */
export interface PendingLogin {
    state: string;
    nonce: string;
    verifier: string;
    redirectUri: string;
    returnTo?: string;
    createdAt: number;
}

export interface ServerTokenSet {
    accessToken: string;
    idToken: string | null;
    refreshToken: string | null;
    /** ms since epoch */
    expiresAt: number;
    scope: string;
    returnTo?: string;
}

interface Discovery {
    issuer: string;
    authorization_endpoint: string;
    token_endpoint: string;
    userinfo_endpoint: string;
    jwks_uri: string;
    end_session_endpoint?: string;
    revocation_endpoint?: string;
}

const discoveryCache = new Map<string, Promise<Discovery>>();

function base64Url(bytes: Buffer): string {
    return bytes.toString('base64url');
}

export function codeChallenge(verifier: string): string {
    return base64Url(createHash('sha256').update(verifier).digest());
}

function sameString(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
}

function decodePayload(jwt: string): Record<string, unknown> {
    try {
        return JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
        throw new NineError('invalid_token', 'malformed token');
    }
}

export class ServerAuth {
    private readonly issuer: string;
    private readonly fetcher: typeof fetch;

    constructor(private readonly options: ServerAuthOptions) {
        if (!options.issuer || !options.clientId) throw new NineError('invalid_options', 'issuer and clientId are required');
        this.issuer = normalizeIssuer(options.issuer, options.allowInsecureIssuer);
        this.fetcher = options.fetch ?? fetch.bind(globalThis);
    }

    async discovery(): Promise<Discovery> {
        let hit = discoveryCache.get(this.issuer);
        if (!hit) {
            hit = this.fetcher(`${this.issuer}/.well-known/openid-configuration`).then(async (res) => {
                if (!res.ok) throw new NineError('discovery_failed', `HTTP ${res.status}`, res.status);
                return (await res.json()) as Discovery;
            });
            hit.catch(() => discoveryCache.delete(this.issuer));
            discoveryCache.set(this.issuer, hit);
        }
        return hit;
    }

    /** Authorization URL plus the state to keep in the user's session. */
    async createLogin(options: ServerLoginOptions = {}): Promise<{url: string; pending: PendingLogin}> {
        const redirectUri = options.redirectUri ?? this.options.redirectUri;
        if (!redirectUri) throw new NineError('invalid_options', 'redirectUri is required');
        const pending: PendingLogin = {
            state: base64Url(randomBytes(16)),
            nonce: base64Url(randomBytes(16)),
            verifier: base64Url(randomBytes(48)),
            redirectUri,
            returnTo: options.returnTo,
            createdAt: Date.now(),
        };
        const url = new URL((await this.discovery()).authorization_endpoint);
        const params: Record<string, string> = {
            response_type: 'code',
            client_id: this.options.clientId,
            redirect_uri: redirectUri,
            scope: this.options.scope ?? 'openid profile email offline_access',
            state: pending.state,
            nonce: pending.nonce,
            code_challenge: codeChallenge(pending.verifier),
            code_challenge_method: 'S256',
            ...(this.options.audience ? {audience: this.options.audience} : {}),
            ...(this.options.locale ? {ui_locales: this.options.locale} : {}),
            ...(options.loginHint ? {login_hint: options.loginHint} : {}),
            ...(options.screen === 'signup' ? {prompt: 'create'} : options.prompt ? {prompt: options.prompt} : {}),
            ...options.params,
        };
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        return {url: url.toString(), pending};
    }

    /**
     * Completes the login: checks state and issuer, exchanges the code with the PKCE
     * verifier and verifies the ID token (signature, audience, nonce).
     *
     * @param callback the callback URL (absolute or `req.originalUrl`) or its query parameters
     */
    async handleCallback(callback: string | URL | URLSearchParams | Record<string, string | undefined>, pending: PendingLogin | null | undefined): Promise<ServerTokenSet> {
        const params =
            callback instanceof URLSearchParams
                ? callback
                : typeof callback === 'string' || callback instanceof URL
                  ? new URL(String(callback), 'http://localhost').searchParams
                  : new URLSearchParams(Object.entries(callback).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));

        const error = params.get('error');
        if (error) throw new NineError(error, params.get('error_description') ?? undefined, 400);
        const code = params.get('code');
        if (!code) throw new NineError('missing_code', 'no authorization code in the callback', 400);
        if (!pending || !sameString(pending.state, params.get('state') ?? '')) throw new NineError('invalid_state', 'unknown or expired login', 400);
        if (Date.now() - pending.createdAt > (this.options.loginTimeout ?? 3600) * 1000) throw new NineError('invalid_state', 'login expired', 400);

        const config = await this.discovery();
        const iss = params.get('iss');
        if (iss && iss.replace(/\/$/, '') !== config.issuer.replace(/\/$/, '')) throw new NineError('invalid_issuer', `unexpected issuer ${iss}`, 400);

        const tokens = await this.tokenRequest({grant_type: 'authorization_code', code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier});
        const set = this.toTokenSet(tokens);
        set.returnTo = pending.returnTo;
        if (set.idToken) {
            await verifyIdToken(set.idToken, {issuer: this.issuer, clientId: this.options.clientId, nonce: pending.nonce, allowInsecureIssuer: this.options.allowInsecureIssuer, fetch: this.fetcher});
        }
        return set;
    }

    /** Claims of the ID token (verified in handleCallback). */
    claims(tokens: Pick<ServerTokenSet, 'idToken'>): Record<string, unknown> {
        return tokens.idToken ? decodePayload(tokens.idToken) : {};
    }

    /** Exchanges the refresh token; 9in rotates it, so store the returned set. */
    async refresh(tokens: ServerTokenSet): Promise<ServerTokenSet> {
        if (!tokens.refreshToken) throw new NineError('login_required', 'no refresh token');
        return this.toTokenSet(await this.tokenRequest({grant_type: 'refresh_token', refresh_token: tokens.refreshToken}), tokens);
    }

    /** `tokens`, refreshed when the access token expires within `leewayMs`. */
    async ensureFresh(tokens: ServerTokenSet, leewayMs = 60_000): Promise<ServerTokenSet> {
        return tokens.expiresAt - leewayMs > Date.now() ? tokens : this.refresh(tokens);
    }

    /** Token for your own back end (client_credentials; confidential clients). */
    async clientCredentials(scope?: string, audience?: string): Promise<ServerTokenSet> {
        return this.toTokenSet(await this.tokenRequest({grant_type: 'client_credentials', ...(scope ? {scope} : {}), ...(audience ? {audience} : {})}));
    }

    async userInfo(accessToken: string): Promise<Record<string, unknown>> {
        const res = await this.fetcher((await this.discovery()).userinfo_endpoint, {headers: {Authorization: `Bearer ${accessToken}`, Accept: 'application/json'}});
        if (!res.ok) throw new NineError('userinfo_failed', `HTTP ${res.status}`, res.status);
        return (await res.json()) as Record<string, unknown>;
    }

    async revoke(token: string, hint: 'refresh_token' | 'access_token' = 'refresh_token'): Promise<void> {
        const endpoint = (await this.discovery()).revocation_endpoint;
        if (!endpoint) return;
        const form: Record<string, string> = {token, token_type_hint: hint};
        await this.fetcher(endpoint, {method: 'POST', headers: this.clientHeaders(form), body: new URLSearchParams(form)});
    }

    /** URL that ends the 9in session; `returnTo` must be a registered logout URL. */
    async logoutUrl(options: {idToken?: string | null; returnTo?: string} = {}): Promise<string> {
        const url = new URL((await this.discovery()).end_session_endpoint ?? `${this.issuer}/oauth/logout`);
        url.searchParams.set('client_id', this.options.clientId);
        if (options.idToken) url.searchParams.set('id_token_hint', options.idToken);
        if (options.returnTo) url.searchParams.set('post_logout_redirect_uri', options.returnTo);
        return url.toString();
    }

    private clientHeaders(form: Record<string, string>): Record<string, string> {
        const headers: Record<string, string> = {'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json'};
        if (this.options.clientSecret) {
            headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(this.options.clientId)}:${encodeURIComponent(this.options.clientSecret)}`).toString('base64')}`;
        } else {
            form.client_id = this.options.clientId;
        }
        return headers;
    }

    private async tokenRequest(form: Record<string, string>): Promise<Record<string, unknown>> {
        const headers = this.clientHeaders(form);
        const res = await this.fetcher((await this.discovery()).token_endpoint, {method: 'POST', headers, body: new URLSearchParams(form)});
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (!res.ok || typeof json.access_token !== 'string') {
            throw new NineError(String(json.error ?? 'request_failed'), json.error_description ? String(json.error_description) : `HTTP ${res.status}`, res.status);
        }
        return json;
    }

    private toTokenSet(tokens: Record<string, unknown>, previous?: ServerTokenSet): ServerTokenSet {
        return {
            accessToken: String(tokens.access_token),
            idToken: typeof tokens.id_token === 'string' ? tokens.id_token : (previous?.idToken ?? null),
            refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : (previous?.refreshToken ?? null),
            expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
            scope: String(tokens.scope ?? previous?.scope ?? ''),
            ...(previous?.returnTo ? {returnTo: previous.returnTo} : {}),
        };
    }
}
