import {afterEach, describe, expect, it} from '@jest/globals';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {createTokenVerifier, requireAuth, signPayload, webhookHandler, type AuthenticatedRequest, type RequireAuthOptions} from '../index';
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

/** An API route behind requireAuth; returns a function that calls it with a bearer token. */
async function api(options: RequireAuthOptions) {
    const guard = requireAuth(options);
    const url = await start((req, res) =>
        guard(req as AuthenticatedRequest, res, (error) => {
            res.statusCode = error ? 500 : 200;
            res.end(JSON.stringify(error ? {error: String(error)} : (req as AuthenticatedRequest).auth));
        }),
    );
    const call = async (token: string) => {
        const res = await fetch(url, {headers: {Authorization: `Bearer ${token}`}});
        return {status: res.status, body: (await res.json()) as Record<string, unknown>};
    };
    return {call, verifier: guard.verifier};
}

const ALGORITHMS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'ES384', 'EdDSA', 'HS256', 'HS384', 'HS512'];

describe('every signing algorithm (local mode)', () => {
    it.each(ALGORITHMS)('accepts %s access tokens', async (alg) => {
        const tenant = fakeTenant();
        const sign = tenant.keyFor(alg, {secret: 'an-api-secret-of-at-least-32-bytes-long'});
        const {call} = await api({issuer: tenant.issuer, audience: 'https://api.acme.test', secret: 'an-api-secret-of-at-least-32-bytes-long', fetch: tenant.fetch});
        const res = await call(sign());
        expect(res.status).toBe(200);
        expect(res.body.sub).toBe('usr_1');
    });

    it('rejects a token whose alg differs from its key, ID tokens, and wrong HMAC secrets', async () => {
        const tenant = fakeTenant();
        const mismatched = tenant.keyFor('PS256', {jwkAlg: 'RS256'});
        const es = tenant.keyFor('ES256');
        const hs = tenant.keyFor('HS256', {secret: 'right-secret-right-secret-right-secret'});
        const {call} = await api({issuer: tenant.issuer, secret: 'other-secret-other-secret-other-secret', fetch: tenant.fetch});
        expect((await call(mismatched())).body.error_description).toMatch(/does not match the key/);
        expect((await call(es({}, {typ: 'JWT'}))).body.error_description).toMatch(/not an access token/);
        expect((await call(hs())).body.error_description).toMatch(/signature/);
        const noSecret = await api({issuer: tenant.issuer, fetch: tenant.fetch});
        expect((await noSecret.call(hs())).body.error_description).toMatch(/secret/);
        expect((await call('9in_at_opaque')).body.error_description).toMatch(/opaque/);
    });
});

describe('hybrid mode', () => {
    function setup() {
        const tenant = fakeTenant();
        const sign = tenant.keyFor('ES256');
        const revoked = new Set<string>();
        tenant.onIntrospect((token) => (revoked.has(token) ? {active: false} : {active: true, ...tenant.claimsFor({})}));
        return {tenant, sign, revoked, options: {issuer: tenant.issuer, audience: 'https://api.acme.test', clientId: 'api', clientSecret: 'secret', fetch: tenant.fetch}};
    }

    it('is the default with client credentials and caches each answer', async () => {
        const {tenant, sign, options} = setup();
        const {call, verifier} = await api(options);
        const token = sign();
        expect((await call(token)).status).toBe(200);
        expect((await call(token)).status).toBe(200);
        expect(tenant.introspected).toEqual([token]);
        expect(verifier).toBeDefined();
    });

    it('takes revocations into account as soon as the webhook arrives', async () => {
        const {tenant, sign, revoked, options} = setup();
        const {call, verifier} = await api(options);
        const token = sign({jti: 'jti_live'});
        expect((await call(token)).status).toBe(200);

        revoked.add(token);
        expect((await call(token)).status).toBe(200); // cached until 9in tells us

        const hookUrl = await start(webhookHandler('whsec', () => undefined, {verifier, dedupe: true}));
        const body = JSON.stringify({id: 'evt_1', event_type: 'token.revoked', created_at: '2026-11-09T10:00:00.000Z', tenant: 'tnt_1', environment: 'production', data: {token_type: 'access_token', jti: 'jti_live', client_id: 'app_1', user: {id: 'usr_1'}}});
        const hook = await fetch(`${hookUrl}/hooks`, {method: 'POST', headers: {'9in-signature': await signPayload('whsec', 'POST', '/hooks', body)}, body});
        expect(hook.status).toBe(204);

        expect((await call(token)).status).toBe(401);
        expect((await call(token)).status).toBe(401);
        expect(tenant.introspected).toHaveLength(2); // the refusal is remembered
    });

    it('evicts by session and by user', async () => {
        const {tenant, sign, options} = setup();
        const verifier = createTokenVerifier(options);
        const {call} = await api({...options, verifier});
        await call(sign({jti: 'a', sid: 'sid_a'}));
        await call(sign({jti: 'b', sid: 'sid_b', sub: 'usr_2'}));
        expect(verifier.handleEvent({event_type: 'session.revoked', data: {sid: 'sid_a', user: {id: 'usr_1'}}})).toBe(1);
        expect(verifier.handleEvent({event_type: 'user.password_changed', data: {reason: 'reset', user: {id: 'usr_2'}}})).toBe(1);
        expect(tenant.introspected).toHaveLength(2);
    });

    it('accepts opaque tokens through introspection', async () => {
        const {tenant, options} = setup();
        tenant.onIntrospect((token) => (token === '9in_at_live' ? {active: true, token_type: 'access_token', ...tenant.claimsFor({sub: 'usr_9'})} : {active: false}));
        const {call} = await api(options);
        expect(await call('9in_at_live')).toMatchObject({status: 200, body: {sub: 'usr_9'}});
        expect((await call('9in_at_dead')).status).toBe(401);
    });

    it('supports introspect mode and reports introspection failures as server errors', async () => {
        const {tenant, sign, options} = setup();
        const strict = await api({...options, mode: 'introspect'});
        const token = sign();
        await strict.call(token);
        await strict.call(token);
        expect(tenant.introspected).toHaveLength(2);

        const broken = fakeTenant();
        const brokenSign = broken.keyFor('EdDSA');
        const failing = await api({issuer: broken.issuer, clientId: 'api', clientSecret: 'secret', fetch: (async (input: RequestInfo | URL, init?: RequestInit) =>
            String(input).endsWith('/oauth/introspect') ? new Response('{"error":"invalid_client"}', {status: 401}) : broken.fetch(input, init)) as typeof fetch});
        expect((await failing.call(brokenSign())).status).toBe(500);
    });

    it('refuses hybrid mode without client credentials at setup time', () => {
        expect(() => requireAuth({issuer: 'https://acme.9in.test', mode: 'hybrid'})).toThrow(/clientId and clientSecret/);
    });
});
