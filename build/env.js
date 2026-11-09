"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGACY_ENV = void 0;
exports.env = env;
exports.envSource = envSource;
exports.configFromEnv = configFromEnv;
/**
 * 9in settings from the environment: `NINE_<NAME>` first, then the SSOfy names that are
 * still accepted as fallbacks while you migrate.
 */
exports.LEGACY_ENV = {
    NINE_ISSUER: ['SSOFY_ISSUER', 'SSOFY_URL'],
    NINE_CLIENT_ID: ['SSOFY_CLIENT_ID'],
    NINE_CLIENT_SECRET: ['SSOFY_CLIENT_SECRET'],
    NINE_REDIRECT_URI: ['SSOFY_REDIRECT_URI'],
    NINE_ADAPTER_SECRET: ['SSOFY_ADAPTER_SECRET', 'SSOFY_API_SECRET'],
    NINE_WEBHOOK_SECRET: ['SSOFY_WEBHOOK_SECRET'],
};
function names(name) {
    const nine = name.startsWith('NINE_') ? name : `NINE_${name}`;
    return [nine, ...(exports.LEGACY_ENV[nine] ?? [`SSOFY_${nine.slice(5)}`])];
}
/** `env("ISSUER")` reads NINE_ISSUER, then SSOFY_ISSUER / SSOFY_URL. */
function env(name, environment = process.env) {
    for (const candidate of names(name)) {
        const value = environment[candidate];
        if (value !== undefined && value !== '')
            return value;
    }
    return undefined;
}
/** Which variable a setting was read from (for deprecation warnings). */
function envSource(name, environment = process.env) {
    return names(name).find((candidate) => environment[candidate] !== undefined && environment[candidate] !== '');
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
