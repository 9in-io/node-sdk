import {describe, expect, it} from '@jest/globals';
import {execFileSync, spawnSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {signPayload, verifySignature, verifyWebhook} from '@9in/sdk/server';
import {fakeTenant} from '../helpers';

/**
 * Interop between the PHP SDK (9in/php-sdk) and @9in/sdk: requests signed by @9in/sdk are
 * accepted by the PHP AdapterHandler, PHP-signed responses and webhooks verify with
 * @9in/sdk. Needs `php` and an installed PHP SDK (NINE_PHP_SDK_PATH, default ../php).
 */
const phpSdk = resolve(process.env.NINE_PHP_SDK_PATH ?? join(__dirname, '../../../../php'));
const phpAvailable = spawnSync('php', ['-v']).status === 0 && existsSync(join(phpSdk, 'vendor/autoload.php'));
const script = join(__dirname, 'php-adapter.php');

function php(input: Record<string, unknown>): any {
    const output = execFileSync('php', [script], {input: JSON.stringify(input), env: {...process.env, NINE_PHP_SDK_PATH: phpSdk}});
    return JSON.parse(output.toString('utf8'));
}

(phpAvailable ? describe : describe.skip)('PHP SDK ↔ @9in/sdk', () => {
    const secret = 'interop_secret_ä';
    const path = '/nine/authenticate';

    it('PHP AdapterHandler accepts @9in/sdk requests and its responses verify with @9in/sdk', async () => {
        const body = JSON.stringify({identifier: {type: 'email', value: 'jane@acme.test'}, password: 'hunter2'});
        const result = php({
            mode: 'adapter',
            secret,
            path,
            headers: {'9in-signature': await signPayload(secret, 'POST', path, body), '9in-request-id': 'req_interop'},
            body,
        });

        expect(result.status).toBe(200);
        expect(JSON.parse(result.body).user).toEqual({id: '42', email: 'jane@acme.test', name: 'Jäne Ünicode', email_verified: true});
        expect(await verifySignature(secret, result.headers['9in-signature'], 'POST', `${path}#req_interop`, result.body)).toBe(true);
        expect(await verifySignature(secret, result.headers['9in-signature'], 'POST', `${path}#other`, result.body)).toBe(false);
    });

    it('PHP rejects requests that @9in/sdk signed for another path or secret', async () => {
        const body = JSON.stringify({identifier: {type: 'email', value: 'jane@acme.test'}, password: 'hunter2'});
        for (const header of [await signPayload(secret, 'POST', '/nine/user', body), await signPayload('other', 'POST', path, body)]) {
            const result = php({mode: 'adapter', secret, path, headers: {'9in-signature': header}, body});
            expect(result.status).toBe(401);
        }
    });

    it.each(['RS256', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'EdDSA', 'HS256', 'HS512'])('PHP TokenVerifier accepts %s tokens signed by node:crypto', async (alg) => {
        const tenant = fakeTenant();
        const hmacSecret = 'an-api-secret-of-at-least-32-bytes-long';
        const sign = tenant.keyFor(alg, {secret: hmacSecret});
        const jwks = await (await tenant.fetch(`${tenant.issuer}/.well-known/jwks.json`)).json();
        const token = sign();
        expect(php({mode: 'verify', issuer: tenant.issuer, jwks, token, secret: hmacSecret})).toEqual({ok: true, sub: 'usr_1'});
        const tampered = token.slice(0, -6) + (token.endsWith('AAAAAA') ? 'BBBBBB' : 'AAAAAA');
        expect(php({mode: 'verify', issuer: tenant.issuer, jwks, token: tampered, secret: hmacSecret}).ok).toBe(false);
    });

    it('PHP-signed webhooks verify with verifyWebhook()', async () => {
        const body = JSON.stringify({id: 'evt_1', type: 'user.created', createdAt: '2026-11-09T10:00:00Z', tenant: 'tnt_1', environment: 'production', data: {userId: 'usr_1'}});
        const {header} = php({mode: 'sign', secret, method: 'POST', path: '/webhooks/9in', body});
        const event = await verifyWebhook(secret, new Request('https://app.acme.test/webhooks/9in', {method: 'POST', headers: {'9in-signature': header}, body}));
        expect(event.id).toBe('evt_1');

        const tampered = new Request('https://app.acme.test/webhooks/9in', {method: 'POST', headers: {'9in-signature': header}, body: body.replace('evt_1', 'evt_2')});
        await expect(verifyWebhook(secret, tampered)).rejects.toMatchObject({code: 'invalid_signature'});
    });
});
