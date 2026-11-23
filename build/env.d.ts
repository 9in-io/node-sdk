/** 9in settings from the environment: `NINE_<NAME>`. */
type Environment = Record<string, string | undefined>;
/** `env("ISSUER")` reads NINE_ISSUER. */
export declare function env(name: string, environment?: Environment): string | undefined;
/** The variable a setting is read from (`NINE_ISSUER` for "ISSUER") when it is set. */
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
