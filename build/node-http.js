"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.readRawBody = readRawBody;
exports.toRequest = toRequest;
exports.sendResponse = sendResponse;
exports.toNodeHandler = toNodeHandler;
/**
 * The raw request body. Signatures are computed over the exact bytes 9in sent, so mount
 * 9in handlers before `express.json()`, or use `express.raw()` / a parser that keeps
 * `req.rawBody`.
 */
async function readRawBody(req) {
    if (typeof req.rawBody === 'string')
        return req.rawBody;
    if (Buffer.isBuffer(req.rawBody))
        return req.rawBody.toString('utf8');
    if (Buffer.isBuffer(req.body))
        return req.body.toString('utf8');
    if (typeof req.body === 'string')
        return req.body;
    if (req.readableEnded || (req.body !== undefined && req.body !== null && typeof req.body === 'object' && Object.keys(req.body).length > 0)) {
        throw new Error('9in: the request body was already parsed; mount 9in handlers before express.json() or keep req.rawBody');
    }
    const chunks = [];
    for await (const chunk of req)
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    return Buffer.concat(chunks).toString('utf8');
}
/**
 * Fetch API Request for a node:http request. The URL keeps the full path the client
 * called (`originalUrl` under Express routers), which is what 9in signs.
 */
async function toRequest(req, body) {
    const host = req.headers.host ?? 'localhost';
    const url = new URL(req.originalUrl ?? req.url ?? '/', `http://${host}`);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
        if (value === undefined)
            continue;
        if (Array.isArray(value))
            value.forEach((v) => headers.append(name, v));
        else
            headers.set(name, value);
    }
    const method = (req.method ?? 'GET').toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    return new Request(url, { method, headers, body: hasBody ? (body ?? (await readRawBody(req))) : undefined });
}
/** Writes a Fetch API Response to a node:http response. */
async function sendResponse(res, response) {
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    const body = response.body ? Buffer.from(await response.arrayBuffer()) : undefined;
    res.end(body);
}
/**
 * Turns a Fetch API handler (adapterHandler, a webhook handler…) into a node:http /
 * Express / Connect handler.
 */
function toNodeHandler(handler) {
    return async (req, res, next) => {
        try {
            await sendResponse(res, await handler(await toRequest(req)));
        }
        catch (error) {
            if (next)
                next(error);
            else {
                res.statusCode = 500;
                res.end();
            }
        }
    };
}
