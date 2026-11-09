/**
 * 9in settings from the environment: `NINE_<NAME>` first, then the SSOfy names that are
 * still accepted as fallbacks while you migrate.
 */
export declare const LEGACY_ENV: Readonly<Record<string, readonly string[]>>;
type Environment = Record<string, string | undefined>;
/** `env("ISSUER")` reads NINE_ISSUER, then SSOFY_ISSUER / SSOFY_URL. */
export declare function env(name: string, environment?: Environment): string | undefined;
/** Which variable a setting was read from (for deprecation warnings). */
export declare function envSource(name: string, environment?: Environment): string | undefined;
/** Settings shared by ServerAuth, ManagementClient and the middleware. */
export declare function configFromEnv(environment?: Environment): {
    issuer: string | undefined;
    clientId: string | undefined;
    clientSecret: string | undefined;
    redirectUri: string | undefined;
    audience: string | undefined;
    adapterSecret: string | undefined;
    webhookSecret: string | undefined;
};
export {};
