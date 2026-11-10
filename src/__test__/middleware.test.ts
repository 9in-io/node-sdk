import {afterEach, describe, expect, it} from '@jest/globals';
import {generateKeyPairSync} from 'node:crypto';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {MemoryEventStore, adapterMiddleware, requireAuth, signPayload, verifySignature, webhookHandler, type AuthenticatedRequest} from '../index';
import {fakeTenant, serve} from './helpers';

const servers: {close: () => Promise<void>}[] = [];
afterEach(async () => {
    await Promise.all(servers.splice(0).map((s) => s.close()));
});

async function start(handler: (req: IncomingMessage, res: ServerResponse) => void) {
    const server = await serve(handler);
    servers.push(server);
    return server.url;
}

describe('issuer validation', () => {
    it('refuses plain-http issuers at setup time', () => {
        expect(() => requireAuth({issuer: 'http://acme.9in.io'})).toThrow(/https/);
        expect(() => requireAuth({issuer: 'http://acme.localhost:8787'})).not.toThrow();
        expect(() => requireAuth({issuer: 'http://auth:8897', allowInsecureIssuer: true})).not.toThrow();
    });
});

describe('requireAuth', () => {
    const tenant = fakeTenant();
    const guard = requireAuth({issuer: tenant.issuer, audience: 'https://api.acme.test', scope: 'orders:read', fetch: tenant.fetch});

    async function call(token?: string) {
        const url = await start((req, res) =>
            guard(req as AuthenticatedRequest, res, (error) => {
                res.statusCode = error ? 500 : 200;
                res.end(JSON.stringify((req as AuthenticatedRequest).auth ?? null));
            }),
        );
        return fetch(url, {headers: token ? {Authorization: `Bearer ${token}`} : {}});
    }

    it('accepts a valid token and exposes the claims', async () => {
        const res = await call(tenant.sign());
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({sub: 'usr_1', client_id: 'app_1'});
    });

    it('rejects missing, expired, foreign and wrong-audience tokens with 401', async () => {
        const foreign = generateKeyPairSync('rsa', {modulusLength: 2048}).privateKey;
        for (const token of [undefined, tenant.sign({exp: 1}), tenant.sign({}, foreign), tenant.sign({aud: 'https://other.api'})]) {
            const res = await call(token);
            expect(res.status).toBe(401);
            expect(res.headers.get('www-authenticate')).toContain('Bearer');
        }
    });

    it('answers 403 when a scope is missing', async () => {
        const res = await call(tenant.sign({scope: 'openid'}));
        expect(res.status).toBe(403);
        expect(await res.json()).toMatchObject({error: 'insufficient_scope'});
    });
});

describe('adapterMiddleware', () => {
    const secret = 'adapter_secret';

    async function adapterCall(path: string, body: unknown, signWith = secret) {
        const url = await start(
            adapterMiddleware({
                secret,
                async authenticate(identifier, password) {
                    if (identifier.value === 'blocked@acme.test') return 'blocked';
                    return identifier.value === 'jane@acme.test' && password === 'hunter2' ? {id: '42', email: 'jane@acme.test'} : 'invalid';
                },
                async findUser(query) {
                    return 'id' in query && query.id === '42' ? {id: '42'} : null;
                },
            }),
        );
        const raw = JSON.stringify(body);
        return fetch(url + path, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', '9in-request-id': 'req_1', '9in-signature': await signPayload(signWith, 'POST', path, raw)},
            body: raw,
        });
    }

    it('serves signed responses bound to the request id', async () => {
        const res = await adapterCall('/nine/authenticate', {identifier: {type: 'email', value: 'jane@acme.test'}, password: 'hunter2'});
        const text = await res.text();
        expect(res.status).toBe(200);
        expect(JSON.parse(text)).toEqual({user: {id: '42', email: 'jane@acme.test'}});
        expect(await verifySignature(secret, res.headers.get('9in-signature'), 'POST', '/nine/authenticate#req_1', text)).toBe(true);
        expect(await verifySignature(secret, res.headers.get('9in-signature'), 'POST', '/nine/authenticate#req_2', text)).toBe(false);
    });

    it('maps results to protocol errors', async () => {
        expect((await adapterCall('/nine/authenticate', {identifier: {type: 'email', value: 'jane@acme.test'}, password: 'x'})).status).toBe(401);
        expect((await adapterCall('/nine/authenticate', {identifier: {type: 'email', value: 'blocked@acme.test'}, password: 'x'})).status).toBe(403);
        expect((await adapterCall('/nine/user', {id: '7'})).status).toBe(404);
        expect((await adapterCall('/nine/user', {id: '42'})).status).toBe(200);
    });

    it('rejects requests signed with another secret', async () => {
        const res = await adapterCall('/nine/user', {id: '42'}, 'other');
        expect(res.status).toBe(401);
    });
});

describe('webhookHandler', () => {
    const secret = 'whsec_test';
    const event = {id: 'evt_1', event_type: 'user.created', created_at: '2026-11-09T10:00:00.000Z', tenant: 'tnt_1', environment: 'production', data: {user: {id: 'usr_1'}}};

    it('verifies, parses and answers 204', async () => {
        const received: unknown[] = [];
        const url = await start(webhookHandler(secret, (e) => void received.push(e)));
        const body = JSON.stringify(event);
        const res = await fetch(`${url}/webhooks/9in`, {method: 'POST', headers: {'9in-signature': await signPayload(secret, 'POST', '/webhooks/9in', body)}, body});
        expect(res.status).toBe(204);
        expect(received).toEqual([event]);
    });

    it('rejects bad signatures and other paths', async () => {
        const received: unknown[] = [];
        const url = await start(webhookHandler(secret, (e) => void received.push(e)));
        const body = JSON.stringify(event);
        const wrongPath = await fetch(`${url}/webhooks/9in`, {method: 'POST', headers: {'9in-signature': await signPayload(secret, 'POST', '/other', body)}, body});
        const unsigned = await fetch(`${url}/webhooks/9in`, {method: 'POST', body});
        expect([wrongPath.status, unsigned.status]).toEqual([401, 401]);
        expect(received).toEqual([]);
    });

    it('calls onEvent once per event id with dedupe', async () => {
        const received: string[] = [];
        let failNext = true;
        const store = new MemoryEventStore();
        const url = await start(webhookHandler(secret, (e) => {
            if (e.id === 'evt_flaky' && failNext) {
                failNext = false;
                throw new Error('db down');
            }
            received.push(e.id);
        }, {dedupe: store}));
        const send = async (id: string) => {
            const body = JSON.stringify({...event, id});
            return (await fetch(`${url}/w`, {method: 'POST', headers: {'9in-signature': await signPayload(secret, 'POST', '/w', body)}, body})).status;
        };

        expect([await send('evt_a'), await send('evt_a')]).toEqual([204, 204]);
        expect([await send('evt_flaky'), await send('evt_flaky'), await send('evt_flaky')]).toEqual([500, 204, 204]);
        await store.add('9in:webhook:evt_busy', 'processing', 300);
        expect(await send('evt_busy')).toBe(409);
        expect(received).toEqual(['evt_a', 'evt_flaky']);
    });

    it('answers 500 when the handler fails so 9in retries', async () => {
        const url = await start(webhookHandler(secret, () => {
            throw new Error('db down');
        }));
        const body = JSON.stringify(event);
        const res = await fetch(`${url}/w`, {method: 'POST', headers: {'9in-signature': await signPayload(secret, 'POST', '/w', body)}, body});
        expect(res.status).toBe(500);
    });
});
