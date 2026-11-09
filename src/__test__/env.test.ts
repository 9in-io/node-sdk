import {describe, expect, it} from '@jest/globals';
import {configFromEnv, env, envSource} from '../env';

describe('env', () => {
    it('prefers NINE_* and falls back to SSOFY_*', () => {
        const environment = {SSOFY_URL: 'https://old.ssofy.test', SSOFY_API_SECRET: 'legacy', NINE_CLIENT_ID: 'app_1', SSOFY_CLIENT_ID: 'old_app'};
        expect(env('ISSUER', environment)).toBe('https://old.ssofy.test');
        expect(envSource('ISSUER', environment)).toBe('SSOFY_URL');
        expect(env('NINE_CLIENT_ID', environment)).toBe('app_1');
        expect(env('ADAPTER_SECRET', environment)).toBe('legacy');
        expect(env('SOMETHING', {SSOFY_SOMETHING: 'x'})).toBe('x');
        expect(env('MISSING', {})).toBeUndefined();
    });

    it('builds a config', () => {
        expect(configFromEnv({NINE_ISSUER: 'https://acme.9in.io', SSOFY_WEBHOOK_SECRET: 'whsec'})).toMatchObject({
            issuer: 'https://acme.9in.io',
            webhookSecret: 'whsec',
            clientId: undefined,
        });
    });
});
