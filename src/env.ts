/** 9in settings from the environment: `NINE_<NAME>`. */

type Environment = Record<string, string | undefined>;

function nineName(name: string): string {
    return name.startsWith('NINE_') ? name : `NINE_${name}`;
}

/** `env("ISSUER")` reads NINE_ISSUER. */
export function env(name: string, environment: Environment = process.env): string | undefined {
    const value = environment[nineName(name)];
    return value === undefined || value === '' ? undefined : value;
}

/** The variable a setting is read from (`NINE_ISSUER` for "ISSUER") when it is set. */
export function envSource(name: string, environment: Environment = process.env): string | undefined {
    return env(name, environment) === undefined ? undefined : nineName(name);
}

/** Settings shared by ServerAuth, ManagementClient and the middleware. */
export function configFromEnv(environment: Environment = process.env) {
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
