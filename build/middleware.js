"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
exports.verifyWebhookMiddleware = verifyWebhookMiddleware;
exports.webhookHandler = webhookHandler;
exports.adapterMiddleware = adapterMiddleware;
const server_1 = require("@9in/sdk/server");
const node_http_1 = require("./node-http");
function json(res, status, body, headers = {}) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    for (const [name, value] of Object.entries(headers))
        res.setHeader(name, value);
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
function requireAuth(options) {
    // Built once, so a bad configuration fails at startup rather than with a 401 per request.
    const verifier = options.verifier ??
        (0, server_1.createTokenVerifier)({
            ...options,
            mode: options.mode ?? (options.clientId && options.clientSecret ? 'hybrid' : 'local'),
        });
    const middleware = async (req, res, next) => {
        const header = req.headers.authorization ?? '';
        const token = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, '').trim() : '';
        if (!token && options.optional)
            return next();
        try {
            req.auth = await verifier.verify(token, { scope: options.scope });
            next();
        }
        catch (error) {
            // invalid_token → 401, insufficient_scope → 403; anything else (introspection
            // failing, network) is a server problem, not the caller's.
            if (!(error instanceof server_1.NineError) || (error.code !== 'invalid_token' && error.code !== 'insufficient_scope'))
                return next(error);
            if (error.code === 'insufficient_scope') {
                const scope = Array.isArray(options.scope) ? options.scope.join(' ') : (options.scope ?? '');
                return json(res, 403, { error: error.code, error_description: error.message }, { 'WWW-Authenticate': `Bearer error="insufficient_scope", scope="${scope}"` });
            }
            json(res, 401, { error: 'invalid_token', error_description: error.message }, { 'WWW-Authenticate': 'Bearer realm="9in", error="invalid_token"' });
        }
    };
    return Object.assign(middleware, { verifier });
}
const sharedEventStore = new server_1.MemoryEventStore();
/**
 * Express / Connect middleware: verifies a 9in webhook (signature over the raw body and
 * path) and sets `req.nineEvent`. Mount it before `express.json()` or use `express.raw()`.
 */
function verifyWebhookMiddleware(secret, options = {}) {
    return async (req, res, next) => {
        let body;
        try {
            body = await (0, node_http_1.readRawBody)(req);
        }
        catch (error) {
            return next(error);
        }
        const path = options.path ?? new URL(req.originalUrl ?? req.url ?? '/', 'http://localhost').pathname;
        const signature = req.headers['9in-signature'];
        const valid = (req.method ?? '').toUpperCase() === 'POST' &&
            (await (0, server_1.verifySignature)(secret, typeof signature === 'string' ? signature : null, 'POST', path, body, options.toleranceSeconds));
        if (!valid)
            return json(res, 401, { error: 'invalid_signature' });
        try {
            req.nineEvent = JSON.parse(body);
        }
        catch {
            return json(res, 400, { error: 'invalid_payload' });
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
function webhookHandler(secret, onEvent, options = {}) {
    const verify = verifyWebhookMiddleware(secret, options);
    const store = options.dedupe === true ? sharedEventStore : options.dedupe || null;
    const verifiers = options.verifier ? (Array.isArray(options.verifier) ? options.verifier : [options.verifier]) : [];
    return (req, res, next) => verify(req, res, async (error) => {
        if (error)
            return next ? next(error) : json(res, 500, { error: 'server_error' });
        try {
            const event = req.nineEvent;
            // Evict first, also for duplicates and before onEvent can fail.
            for (const verifier of verifiers)
                verifier.handleEvent(event);
            if (store) {
                const outcome = await (0, server_1.processEventOnce)(store, event.id, () => onEvent(event), { ttlSeconds: options.dedupeTtlSeconds, prefix: '9in:webhook:' });
                if (outcome.status === 'in_progress')
                    return json(res, 409, { error: 'in_progress' });
            }
            else {
                await onEvent(event);
            }
            res.statusCode = 204;
            res.end();
        }
        catch (failure) {
            if (next)
                next(failure);
            else
                json(res, 500, { error: 'server_error' });
        }
    });
}
/**
 * Adapter protocol v2 for node:http / Express / Connect (wraps `adapterHandler` from
 * @9in/sdk). Serves `<mount>/authenticate`, `<mount>/user` and `<mount>/event`.
 *
 *   app.use('/nine', adapterMiddleware({secret, authenticate, findUser, onEvent}))
 */
function adapterMiddleware(handlers) {
    return (0, node_http_1.toNodeHandler)((0, server_1.adapterHandler)(handlers));
}
