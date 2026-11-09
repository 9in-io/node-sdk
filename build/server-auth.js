"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerAuth = void 0;
exports.codeChallenge = codeChallenge;
const node_crypto_1 = require("node:crypto");
const server_1 = require("@9in-io/sdk/server");
const id_token_1 = require("./id-token");
const discoveryCache = new Map();
function base64Url(bytes) {
    return bytes.toString('base64url');
}
function codeChallenge(verifier) {
    return base64Url((0, node_crypto_1.createHash)('sha256').update(verifier).digest());
}
function sameString(a, b) {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && (0, node_crypto_1.timingSafeEqual)(left, right);
}
function decodePayload(jwt) {
    try {
        return JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8'));
    }
    catch {
        throw new server_1.NineError('invalid_token', 'malformed token');
    }
}
class ServerAuth {
    options;
    issuer;
    fetcher;
    constructor(options) {
        this.options = options;
        if (!options.issuer || !options.clientId)
            throw new server_1.NineError('invalid_options', 'issuer and clientId are required');
        this.issuer = (0, server_1.normalizeIssuer)(options.issuer, options.allowInsecureIssuer);
        this.fetcher = options.fetch ?? fetch.bind(globalThis);
    }
    async discovery() {
        let hit = discoveryCache.get(this.issuer);
        if (!hit) {
            hit = this.fetcher(`${this.issuer}/.well-known/openid-configuration`).then(async (res) => {
                if (!res.ok)
                    throw new server_1.NineError('discovery_failed', `HTTP ${res.status}`, res.status);
                return (await res.json());
            });
            hit.catch(() => discoveryCache.delete(this.issuer));
            discoveryCache.set(this.issuer, hit);
        }
        return hit;
    }
    /** Authorization URL plus the state to keep in the user's session. */
    async createLogin(options = {}) {
        const redirectUri = options.redirectUri ?? this.options.redirectUri;
        if (!redirectUri)
            throw new server_1.NineError('invalid_options', 'redirectUri is required');
        const pending = {
            state: base64Url((0, node_crypto_1.randomBytes)(16)),
            nonce: base64Url((0, node_crypto_1.randomBytes)(16)),
            verifier: base64Url((0, node_crypto_1.randomBytes)(48)),
            redirectUri,
            returnTo: options.returnTo,
            createdAt: Date.now(),
        };
        const url = new URL((await this.discovery()).authorization_endpoint);
        const params = {
            response_type: 'code',
            client_id: this.options.clientId,
            redirect_uri: redirectUri,
            scope: this.options.scope ?? 'openid profile email offline_access',
            state: pending.state,
            nonce: pending.nonce,
            code_challenge: codeChallenge(pending.verifier),
            code_challenge_method: 'S256',
            ...(this.options.audience ? { audience: this.options.audience } : {}),
            ...(this.options.locale ? { ui_locales: this.options.locale } : {}),
            ...(options.loginHint ? { login_hint: options.loginHint } : {}),
            ...(options.screen === 'signup' ? { prompt: 'create' } : options.prompt ? { prompt: options.prompt } : {}),
            ...options.params,
        };
        for (const [key, value] of Object.entries(params))
            url.searchParams.set(key, value);
        return { url: url.toString(), pending };
    }
    /**
     * Completes the login: checks state and issuer, exchanges the code with the PKCE
     * verifier and verifies the ID token (signature, audience, nonce).
     *
     * @param callback the callback URL (absolute or `req.originalUrl`) or its query parameters
     */
    async handleCallback(callback, pending) {
        const params = callback instanceof URLSearchParams
            ? callback
            : typeof callback === 'string' || callback instanceof URL
                ? new URL(String(callback), 'http://localhost').searchParams
                : new URLSearchParams(Object.entries(callback).filter((entry) => typeof entry[1] === 'string'));
        const error = params.get('error');
        if (error)
            throw new server_1.NineError(error, params.get('error_description') ?? undefined, 400);
        const code = params.get('code');
        if (!code)
            throw new server_1.NineError('missing_code', 'no authorization code in the callback', 400);
        if (!pending || !sameString(pending.state, params.get('state') ?? ''))
            throw new server_1.NineError('invalid_state', 'unknown or expired login', 400);
        if (Date.now() - pending.createdAt > (this.options.loginTimeout ?? 3600) * 1000)
            throw new server_1.NineError('invalid_state', 'login expired', 400);
        const config = await this.discovery();
        const iss = params.get('iss');
        if (iss && iss.replace(/\/$/, '') !== config.issuer.replace(/\/$/, ''))
            throw new server_1.NineError('invalid_issuer', `unexpected issuer ${iss}`, 400);
        const tokens = await this.tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: pending.redirectUri, code_verifier: pending.verifier });
        const set = this.toTokenSet(tokens);
        set.returnTo = pending.returnTo;
        if (set.idToken) {
            await (0, id_token_1.verifyIdToken)(set.idToken, { issuer: this.issuer, clientId: this.options.clientId, nonce: pending.nonce, allowInsecureIssuer: this.options.allowInsecureIssuer, fetch: this.fetcher });
        }
        return set;
    }
    /** Claims of the ID token (verified in handleCallback). */
    claims(tokens) {
        return tokens.idToken ? decodePayload(tokens.idToken) : {};
    }
    /** Exchanges the refresh token; 9in rotates it, so store the returned set. */
    async refresh(tokens) {
        if (!tokens.refreshToken)
            throw new server_1.NineError('login_required', 'no refresh token');
        return this.toTokenSet(await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refreshToken }), tokens);
    }
    /** `tokens`, refreshed when the access token expires within `leewayMs`. */
    async ensureFresh(tokens, leewayMs = 60_000) {
        return tokens.expiresAt - leewayMs > Date.now() ? tokens : this.refresh(tokens);
    }
    /** Token for your own back end (client_credentials; confidential clients). */
    async clientCredentials(scope, audience) {
        return this.toTokenSet(await this.tokenRequest({ grant_type: 'client_credentials', ...(scope ? { scope } : {}), ...(audience ? { audience } : {}) }));
    }
    async userInfo(accessToken) {
        const res = await this.fetcher((await this.discovery()).userinfo_endpoint, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' } });
        if (!res.ok)
            throw new server_1.NineError('userinfo_failed', `HTTP ${res.status}`, res.status);
        return (await res.json());
    }
    async revoke(token, hint = 'refresh_token') {
        const endpoint = (await this.discovery()).revocation_endpoint;
        if (!endpoint)
            return;
        const form = { token, token_type_hint: hint };
        await this.fetcher(endpoint, { method: 'POST', headers: this.clientHeaders(form), body: new URLSearchParams(form) });
    }
    /** URL that ends the 9in session; `returnTo` must be a registered logout URL. */
    async logoutUrl(options = {}) {
        const url = new URL((await this.discovery()).end_session_endpoint ?? `${this.issuer}/oauth/logout`);
        url.searchParams.set('client_id', this.options.clientId);
        if (options.idToken)
            url.searchParams.set('id_token_hint', options.idToken);
        if (options.returnTo)
            url.searchParams.set('post_logout_redirect_uri', options.returnTo);
        return url.toString();
    }
    clientHeaders(form) {
        const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' };
        if (this.options.clientSecret) {
            headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(this.options.clientId)}:${encodeURIComponent(this.options.clientSecret)}`).toString('base64')}`;
        }
        else {
            form.client_id = this.options.clientId;
        }
        return headers;
    }
    async tokenRequest(form) {
        const headers = this.clientHeaders(form);
        const res = await this.fetcher((await this.discovery()).token_endpoint, { method: 'POST', headers, body: new URLSearchParams(form) });
        const json = (await res.json().catch(() => ({})));
        if (!res.ok || typeof json.access_token !== 'string') {
            throw new server_1.NineError(String(json.error ?? 'request_failed'), json.error_description ? String(json.error_description) : `HTTP ${res.status}`, res.status);
        }
        return json;
    }
    toTokenSet(tokens, previous) {
        return {
            accessToken: String(tokens.access_token),
            idToken: typeof tokens.id_token === 'string' ? tokens.id_token : (previous?.idToken ?? null),
            refreshToken: typeof tokens.refresh_token === 'string' ? tokens.refresh_token : (previous?.refreshToken ?? null),
            expiresAt: Date.now() + Number(tokens.expires_in ?? 3600) * 1000,
            scope: String(tokens.scope ?? previous?.scope ?? ''),
            ...(previous?.returnTo ? { returnTo: previous.returnTo } : {}),
        };
    }
}
exports.ServerAuth = ServerAuth;
