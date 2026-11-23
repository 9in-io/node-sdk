"use strict";
/** 9in settings from the environment: `NINE_<NAME>`. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = env;
exports.envSource = envSource;
exports.configFromEnv = configFromEnv;
function nineName(name) {
    return name.startsWith('NINE_') ? name : `NINE_${name}`;
}
/** `env("ISSUER")` reads NINE_ISSUER. */
function env(name, environment = process.env) {
    const value = environment[nineName(name)];
    return value === undefined || value === '' ? undefined : value;
}
/** The variable a setting is read from (`NINE_ISSUER` for "ISSUER") when it is set. */
function envSource(name, environment = process.env) {
    return env(name, environment) === undefined ? undefined : nineName(name);
}
/** Settings shared by ServerAuth, ManagementClient and the middleware. */
function configFromEnv(environment = process.env) {
    return {
        issuer: env('ISSUER', environment),
        clientId: env('CLIENT_ID', environment),
        clientSecret: env('CLIENT_SECRET', environment),
        redirectUri: env('REDIRECT_URI', environment),
        audience: env('AUDIENCE', environment),
        adapterSecret: env('ADAPTER_SECRET', environment),
        webhookSecret: env('WEBHOOK_SECRET', environment),
    };
}
