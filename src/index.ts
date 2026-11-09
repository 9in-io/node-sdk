/**
 * @9in/node: the 9in SDK for Node.js.
 *
 * Everything from `@9in/sdk/server` (verifyAccessToken, ManagementClient, adapterHandler,
 * verifyWebhook, verifySignature, signPayload, NineError and the types) is re-exported,
 * plus Node-specific helpers.
 */
export * from '@9in/sdk/server';

export {env, envSource, configFromEnv, LEGACY_ENV} from './env';
export {readRawBody, toRequest, sendResponse, toNodeHandler} from './node-http';
export type {NodeRequest, NextFunction, FetchHandler} from './node-http';
export {requireAuth, verifyWebhookMiddleware, webhookHandler, adapterMiddleware} from './middleware';
export type {AuthenticatedRequest, AuthMiddleware, WebhookRequest, RequireAuthOptions, WebhookOptions, WebhookHandlerOptions} from './middleware';
export {verifyIdToken} from './id-token';
export type {VerifyIdTokenOptions} from './id-token';
export {ServerAuth, codeChallenge} from './server-auth';
export type {ServerAuthOptions, ServerLoginOptions, PendingLogin, ServerTokenSet} from './server-auth';
export {otpSender} from './otp';
export type {OtpRequestedData, OtpSenderOptions} from './otp';

export * from './Notifications';
export * from './Events';
export {BaseError} from './Errors/BaseError';
export {TemplateNotFoundError} from './Errors/TemplateNotFoundError';
