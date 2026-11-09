"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateNotFoundError = exports.BaseError = exports.otpSender = exports.codeChallenge = exports.ServerAuth = exports.verifyIdToken = exports.adapterMiddleware = exports.webhookHandler = exports.verifyWebhookMiddleware = exports.requireAuth = exports.toNodeHandler = exports.sendResponse = exports.toRequest = exports.readRawBody = exports.LEGACY_ENV = exports.configFromEnv = exports.envSource = exports.env = void 0;
/**
 * @9in/node: the 9in SDK for Node.js.
 *
 * Everything from `@9in/sdk/server` (verifyAccessToken, ManagementClient, adapterHandler,
 * verifyWebhook, verifySignature, signPayload, NineError and the types) is re-exported,
 * plus Node-specific helpers.
 */
__exportStar(require("@9in/sdk/server"), exports);
var env_1 = require("./env");
Object.defineProperty(exports, "env", { enumerable: true, get: function () { return env_1.env; } });
Object.defineProperty(exports, "envSource", { enumerable: true, get: function () { return env_1.envSource; } });
Object.defineProperty(exports, "configFromEnv", { enumerable: true, get: function () { return env_1.configFromEnv; } });
Object.defineProperty(exports, "LEGACY_ENV", { enumerable: true, get: function () { return env_1.LEGACY_ENV; } });
var node_http_1 = require("./node-http");
Object.defineProperty(exports, "readRawBody", { enumerable: true, get: function () { return node_http_1.readRawBody; } });
Object.defineProperty(exports, "toRequest", { enumerable: true, get: function () { return node_http_1.toRequest; } });
Object.defineProperty(exports, "sendResponse", { enumerable: true, get: function () { return node_http_1.sendResponse; } });
Object.defineProperty(exports, "toNodeHandler", { enumerable: true, get: function () { return node_http_1.toNodeHandler; } });
var middleware_1 = require("./middleware");
Object.defineProperty(exports, "requireAuth", { enumerable: true, get: function () { return middleware_1.requireAuth; } });
Object.defineProperty(exports, "verifyWebhookMiddleware", { enumerable: true, get: function () { return middleware_1.verifyWebhookMiddleware; } });
Object.defineProperty(exports, "webhookHandler", { enumerable: true, get: function () { return middleware_1.webhookHandler; } });
Object.defineProperty(exports, "adapterMiddleware", { enumerable: true, get: function () { return middleware_1.adapterMiddleware; } });
var id_token_1 = require("./id-token");
Object.defineProperty(exports, "verifyIdToken", { enumerable: true, get: function () { return id_token_1.verifyIdToken; } });
var server_auth_1 = require("./server-auth");
Object.defineProperty(exports, "ServerAuth", { enumerable: true, get: function () { return server_auth_1.ServerAuth; } });
Object.defineProperty(exports, "codeChallenge", { enumerable: true, get: function () { return server_auth_1.codeChallenge; } });
var otp_1 = require("./otp");
Object.defineProperty(exports, "otpSender", { enumerable: true, get: function () { return otp_1.otpSender; } });
__exportStar(require("./Notifications"), exports);
__exportStar(require("./Events"), exports);
var BaseError_1 = require("./Errors/BaseError");
Object.defineProperty(exports, "BaseError", { enumerable: true, get: function () { return BaseError_1.BaseError; } });
var TemplateNotFoundError_1 = require("./Errors/TemplateNotFoundError");
Object.defineProperty(exports, "TemplateNotFoundError", { enumerable: true, get: function () { return TemplateNotFoundError_1.TemplateNotFoundError; } });
