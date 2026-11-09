import type { ServerResponse } from 'node:http';
import { type AccessTokenClaims, type AdapterHandlers, type EventStore, type TokenVerifier, type TokenVerifierOptions, type VerificationMode, type WebhookEvent } from '@9in/sdk/server';
import { type NextFunction, type NodeRequest } from './node-http';
export interface AuthenticatedRequest extends NodeRequest {
    /** Claims of the verified access token. */
    auth?: AccessTokenClaims;
}
export interface WebhookRequest extends NodeRequest {
    /** The verified webhook event. */
    nineEvent?: WebhookEvent;
}
export interface RequireAuthOptions extends Partial<TokenVerifierOptions> {
    /** Scopes every request must carry (space-separated or array). */
    scope?: string | string[];
    /** Continue without `req.auth` instead of answering 401 when there is no token. */
    optional?: boolean;
    /**
     * `local`, `hybrid` or `introspect` (see createTokenVerifier). Default: `hybrid` when
     * clientId and clientSecret are given, otherwise `local`.
     */
    mode?: VerificationMode;
    /** Share one verifier (and its cache) between routes and your webhook endpoint. */
    verifier?: TokenVerifier;
}
/** The middleware returned by requireAuth, with the verifier it uses. */
export type AuthMiddleware = ((req: AuthenticatedRequest, res: ServerResponse, next: NextFunction) => Promise<void>) & {
    verifier: TokenVerifier;
};
/**
 * Express / Connect middleware: verifies `Authorization: Bearer <access token>` (JWT signed
 * with any of the tenant's keys, or opaque `9in_at_…`) and sets `req.auth`.
 *
 *   const auth = requireAuth({issuer, audience: 'https://api.acme.com', clientId, clientSecret});  // hybrid
 *   app.get('/api/orders', auth, handler);
 *   app.post('/webhooks/9in', webhookHandler(secret, onEvent, {verifier: auth.verifier}));   // revocations evict
 *
 * In hybrid mode a revoked token is refused as soon as the `token.revoked` /
 * `session.revoked` / user webhook reaches `webhookHandler` (or after `cacheTtl`).
 */
export declare function requireAuth(options: RequireAuthOptions): AuthMiddleware;
export interface WebhookOptions {
    /** Signature tolerance in seconds (default 300). */
    toleranceSeconds?: number;
    /** The path 9in posted to, when a proxy rewrote it (default: the request path). */
    path?: string;
}
export interface WebhookHandlerOptions extends WebhookOptions {
    /**
     * Call `onEvent` once per event id. `true` uses an in-memory store (one process);
     * pass a shared EventStore (Redis `SET NX EX`, your database…) when you run several.
     * Retries of a processed event get 204 without calling `onEvent`; a delivery that
     * arrives while the same event is still being handled gets 409 (9in retries later).
     */
    dedupe?: boolean | EventStore;
    /** How long processed ids are remembered, in seconds (default 3 days). */
    dedupeTtlSeconds?: number;
    /**
     * Token verifiers to keep current: `handleEvent` is called with every verified event,
     * so token.revoked / session.revoked / user.* evict cached answers (e.g. `auth.verifier`).
     */
    verifier?: TokenVerifier | TokenVerifier[];
}
/**
 * Express / Connect middleware: verifies a 9in webhook (signature over the raw body and
 * path) and sets `req.nineEvent`. Mount it before `express.json()` or use `express.raw()`.
 */
export declare function verifyWebhookMiddleware(secret: string | string[], options?: WebhookOptions): (req: WebhookRequest, res: ServerResponse, next: NextFunction) => Promise<void>;
/**
 * Complete webhook endpoint: verifies, calls `onEvent`, answers 204 (or 500 when
 * `onEvent` throws, so 9in retries). With `dedupe`, `onEvent` runs once per event id.
 *
 *   app.post('/webhooks/9in', webhookHandler(process.env.NINE_WEBHOOK_SECRET!, async (event) => { … }, {dedupe: true}))
 */
export declare function webhookHandler(secret: string | string[], onEvent: (event: WebhookEvent) => unknown, options?: WebhookHandlerOptions): (req: WebhookRequest, res: ServerResponse, next?: NextFunction) => Promise<void>;
/**
 * Adapter protocol v2 for node:http / Express / Connect (wraps `adapterHandler` from
 * @9in/sdk). Serves `<mount>/authenticate`, `<mount>/user` and `<mount>/event`.
 *
 *   app.use('/nine', adapterMiddleware({secret, authenticate, findUser, onEvent}))
 */
export declare function adapterMiddleware(handlers: AdapterHandlers): (req: NodeRequest, res: ServerResponse, next?: NextFunction) => Promise<void>;
