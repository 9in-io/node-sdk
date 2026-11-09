import type {ServerResponse} from 'node:http';
import {
    MemoryEventStore,
    NineError,
    adapterHandler,
    createTokenVerifier,
    processEventOnce,
    verifySignature,
    type AccessTokenClaims,
    type AdapterHandlers,
    type EventStore,
    type TokenVerifier,
    type TokenVerifierOptions,
    type VerificationMode,
    type WebhookEvent,
} from '@9in/sdk/server';
import {readRawBody, toNodeHandler, type NextFunction, type NodeRequest} from './node-http';

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
export type AuthMiddleware = ((req: AuthenticatedRequest, res: ServerResponse, next: NextFunction) => Promise<void>) & {verifier: TokenVerifier};

function json(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
    res.end(JSON.stringify(body));
}

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
export function requireAuth(options: RequireAuthOptions): AuthMiddleware {
    // Built once, so a bad configuration fails at startup rather than with a 401 per request.
    const verifier =
        options.verifier ??
        createTokenVerifier({
            ...(options as TokenVerifierOptions),
            mode: options.mode ?? (options.clientId && options.clientSecret ? 'hybrid' : 'local'),
        });
    const middleware = async (req: AuthenticatedRequest, res: ServerResponse, next: NextFunction): Promise<void> => {
        const header = req.headers.authorization ?? '';
        const token = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, '').trim() : '';
        if (!token && options.optional) return next();
        try {
            req.auth = await verifier.verify(token, {scope: options.scope});
            next();
        } catch (error) {
            // invalid_token → 401, insufficient_scope → 403; anything else (introspection
            // failing, network) is a server problem, not the caller's.
            if (!(error instanceof NineError) || (error.code !== 'invalid_token' && error.code !== 'insufficient_scope')) return next(error);
            if (error.code === 'insufficient_scope') {
                const scope = Array.isArray(options.scope) ? options.scope.join(' ') : (options.scope ?? '');
                return json(res, 403, {error: error.code, error_description: error.message}, {'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${scope}"`});
            }
            json(res, 401, {error: 'invalid_token', error_description: error.message}, {'WWW-Authenticate': 'Bearer realm="9in", error="invalid_token"'});
        }
    };
    return Object.assign(middleware, {verifier});
}

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

const sharedEventStore = new MemoryEventStore();

/**
 * Express / Connect middleware: verifies a 9in webhook (signature over the raw body and
 * path) and sets `req.nineEvent`. Mount it before `express.json()` or use `express.raw()`.
 */
export function verifyWebhookMiddleware(secret: string | string[], options: WebhookOptions = {}) {
    return async (req: WebhookRequest, res: ServerResponse, next: NextFunction): Promise<void> => {
        let body: string;
        try {
            body = await readRawBody(req);
        } catch (error) {
            return next(error);
        }
        const path = options.path ?? new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost').pathname;
        const signature = req.headers['9in-signature'];
        const valid =
            (req.method ?? '').toUpperCase() === 'POST' &&
            (await verifySignature(secret, typeof signature === 'string' ? signature : null, 'POST', path, body, options.toleranceSeconds));
        if (!valid) return json(res, 401, {error: 'invalid_signature'});
        try {
            req.nineEvent = JSON.parse(body) as WebhookEvent;
        } catch {
            return json(res, 400, {error: 'invalid_payload'});
        }
        next();
    };
}

/**
 * Complete webhook endpoint: verifies, calls `onEvent`, answers 204 (or 500 when
 * `onEvent` throws, so 9in retries). With `dedupe`, `onEvent` runs once per event id.
 *
 *   app.post('/webhooks/9in', webhookHandler(process.env.NINE_WEBHOOK_SECRET!, async (event) => { … }, {dedupe: true}))
 */
export function webhookHandler(secret: string | string[], onEvent: (event: WebhookEvent) => unknown, options: WebhookHandlerOptions = {}) {
    const verify = verifyWebhookMiddleware(secret, options);
    const store = options.dedupe === true ? sharedEventStore : options.dedupe || null;
    const verifiers = options.verifier ? (Array.isArray(options.verifier) ? options.verifier : [options.verifier]) : [];
    return (req: WebhookRequest, res: ServerResponse, next?: NextFunction): Promise<void> =>
        verify(req, res, async (error?: unknown) => {
            if (error) return next ? next(error) : json(res, 500, {error: 'server_error'});
            try {
                const event = req.nineEvent!;
                // Evict first, also for duplicates and before onEvent can fail.
                for (const verifier of verifiers) verifier.handleEvent(event);
                if (store) {
                    const outcome = await processEventOnce(store, event.id, () => onEvent(event), {ttlSeconds: options.dedupeTtlSeconds, prefix: '9in:webhook:'});
                    if (outcome.status === 'in_progress') return json(res, 409, {error: 'in_progress'});
                } else {
                    await onEvent(event);
                }
                res.statusCode = 204;
                res.end();
            } catch (failure) {
                if (next) next(failure);
                else json(res, 500, {error: 'server_error'});
            }
        });
}

/**
 * Adapter protocol v2 for node:http / Express / Connect (wraps `adapterHandler` from
 * @9in/sdk). Serves `<mount>/authenticate`, `<mount>/user` and `<mount>/event`.
 *
 *   app.use('/nine', adapterMiddleware({secret, authenticate, findUser, onEvent}))
 */
export function adapterMiddleware(handlers: AdapterHandlers) {
    return toNodeHandler(adapterHandler(handlers));
}
