import type { IncomingMessage, ServerResponse } from 'node:http';
/** node:http request, plus what Express / Connect / body parsers add. */
export interface NodeRequest extends IncomingMessage {
    originalUrl?: string;
    body?: unknown;
    rawBody?: Buffer | string;
}
export type NextFunction = (error?: unknown) => void;
export type FetchHandler = (request: Request) => Promise<Response> | Response;
/**
 * The raw request body. Signatures are computed over the exact bytes 9in sent, so mount
 * 9in handlers before `express.json()`, or use `express.raw()` / a parser that keeps
 * `req.rawBody`.
 */
export declare function readRawBody(req: NodeRequest): Promise<string>;
/**
 * Fetch API Request for a node:http request. The URL keeps the full path the client
 * called (`originalUrl` under Express routers), which is what 9in signs.
 */
export declare function toRequest(req: NodeRequest, body?: string): Promise<Request>;
/** Writes a Fetch API Response to a node:http response. */
export declare function sendResponse(res: ServerResponse, response: Response): Promise<void>;
/**
 * Turns a Fetch API handler (adapterHandler, a webhook handler…) into a node:http /
 * Express / Connect handler.
 */
export declare function toNodeHandler(handler: FetchHandler): (req: NodeRequest, res: ServerResponse, next?: NextFunction) => Promise<void>;
