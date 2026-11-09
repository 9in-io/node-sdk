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
export declare function codeChallenge(verifier: string): string;
export declare class ServerAuth {
    private readonly options;
    private readonly issuer;
    private readonly fetcher;
    constructor(options: ServerAuthOptions);
    discovery(): Promise<Discovery>;
    /** Authorization URL plus the state to keep in the user's session. */
    createLogin(options?: ServerLoginOptions): Promise<{
        url: string;
        pending: PendingLogin;
    }>;
    /**
     * Completes the login: checks state and issuer, exchanges the code with the PKCE
     * verifier and verifies the ID token (signature, audience, nonce).
     *
     * @param callback the callback URL (absolute or `req.originalUrl`) or its query parameters
     */
    handleCallback(callback: string | URL | URLSearchParams | Record<string, string | undefined>, pending: PendingLogin | null | undefined): Promise<ServerTokenSet>;
    /** Claims of the ID token (verified in handleCallback). */
    claims(tokens: Pick<ServerTokenSet, 'idToken'>): Record<string, unknown>;
    /** Exchanges the refresh token; 9in rotates it, so store the returned set. */
    refresh(tokens: ServerTokenSet): Promise<ServerTokenSet>;
    /** `tokens`, refreshed when the access token expires within `leewayMs`. */
    ensureFresh(tokens: ServerTokenSet, leewayMs?: number): Promise<ServerTokenSet>;
    /** Token for your own back end (client_credentials; confidential clients). */
    clientCredentials(scope?: string, audience?: string): Promise<ServerTokenSet>;
    userInfo(accessToken: string): Promise<Record<string, unknown>>;
    revoke(token: string, hint?: 'refresh_token' | 'access_token'): Promise<void>;
    /** URL that ends the 9in session; `returnTo` must be a registered logout URL. */
    logoutUrl(options?: {
        idToken?: string | null;
        returnTo?: string;
    }): Promise<string>;
    private clientHeaders;
    private tokenRequest;
    private toTokenSet;
}
export {};
