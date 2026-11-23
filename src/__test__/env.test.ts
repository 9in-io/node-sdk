import {describe, expect, it} from '@jest/globals';
import {configFromEnv, env, envSource} from '../env';

describe('env', () => {
    it('reads NINE_* names', () => {
        const environment = {NINE_ISSUER: 'https://acme.9in.io', NINE_CLIENT_ID: 'app_1', NINE_EMPTY: ''};
        expect(env('ISSUER', environment)).toBe('https://acme.9in.io');
        expect(env('NINE_CLIENT_ID', environment)).toBe('app_1');
        expect(envSource('ISSUER', environment)).toBe('NINE_ISSUER');
        expect(env('EMPTY', environment)).toBeUndefined();
        expect(env('MISSING', {})).toBeUndefined();
        expect(envSource('MISSING', {})).toBeUndefined();
    });

    it('ignores the old SSOfy names', () => {
        const environment = {SSOFY_URL: 'https://old.example.test', SSOFY_API_SECRET: 'old', SSOFY_SOMETHING: 'x'};
        expect(env('ISSUER', environment)).toBeUndefined();
        expect(env('ADAPTER_SECRET', environment)).toBeUndefined();
        expect(env('SOMETHING', environment)).toBeUndefined();
    });

    it('builds a config', () => {
        expect(configFromEnv({NINE_ISSUER: 'https://acme.9in.io', NINE_WEBHOOK_SECRET: 'whsec', SSOFY_CLIENT_ID: 'old'})).toMatchObject({
            issuer: 'https://acme.9in.io',
            webhookSecret: 'whsec',
            clientId: undefined,
        });
    });
});
