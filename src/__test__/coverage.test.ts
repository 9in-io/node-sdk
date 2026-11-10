import {afterEach, describe, expect, it} from '@jest/globals';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {NineError, ServerAuth, requireAuth, signPayload, verifyWebhookMiddleware, type AuthenticatedRequest, type WebhookRequest} from '../index';
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

/** The fake tenant plus userinfo and a revocation endpoint whose answer the test picks. */
function tenantWithEndpoints() {
    const tenant = fakeTenant();
    const seen: {url: string; auth: string | null; form: URLSearchParams}[] = [];
    let revocation: () => Response = () => new Response(null, {status: 200});
    let userinfo: () => Response = () => Response.json({sub: 'usr_1', email: 'jane@acme.test'});
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        const headers = new Headers(init?.headers);
        seen.push({url, auth: headers.get('authorization'), form: new URLSearchParams(String(init?.body ?? ''))});
        if (url === `${tenant.issuer}/oauth/revoke`) return revocation();
        if (url === `${tenant.issuer}/oauth/userinfo`) return userinfo();
        return tenant.fetch(input, init);
    }) as typeof fetch;
    tenant.onToken((form) => ({access_token: `at_${form.get('grant_type')}`, expires_in: 300, scope: form.get('scope') ?? ''}));
    return {
        tenant,
        seen,
        auth: (secret: string | null = 's3cr3t') => new ServerAuth({issuer: tenant.issuer, clientId: 'app_1', clientSecret: secret ?? undefined, redirectUri: 'https://app.acme.test/callback', fetch: fetcher}),
        answerRevocation: (fn: () => Response) => (revocation = fn),
        answerUserinfo: (fn: () => Response) => (userinfo = fn),
    };
}

describe('ServerAuth beyond sign-in', () => {
    it('gets client-credentials tokens with the client secret, scope and audience', async () => {
        const {auth, seen, tenant} = tenantWithEndpoints();
        const set = await auth().clientCredentials('orders:read', 'https://api.acme.test');
        expect(set).toMatchObject({accessToken: 'at_client_credentials', refreshToken: null, idToken: null, scope: 'orders:read'});
        const request = seen.find((s) => s.url === `${tenant.issuer}/oauth/token`)!;
        expect(Object.fromEntries(request.form)).toEqual({grant_type: 'client_credentials', scope: 'orders:read', audience: 'https://api.acme.test'});
        expect(request.auth).toBe(`Basic ${Buffer.from('app_1:s3cr3t').toString('base64')}`);
    });

    it('reads userinfo with the access token and maps failures', async () => {
        const {auth, seen, answerUserinfo, tenant} = tenantWithEndpoints();
        expect(await auth().userInfo('at_1')).toEqual({sub: 'usr_1', email: 'jane@acme.test'});
        expect(seen.find((s) => s.url === `${tenant.issuer}/oauth/userinfo`)!.auth).toBe('Bearer at_1');
        answerUserinfo(() => new Response('{"error":"invalid_token"}', {status: 401}));
        await expect(auth().userInfo('at_dead')).rejects.toMatchObject({code: 'userinfo_failed', status: 401});
    });

    it('revokes with client authentication and reports refused revocations', async () => {
        const {auth, seen, answerRevocation, tenant} = tenantWithEndpoints();
        await auth().revoke('rt_1');
        await auth(null).revoke('at_1', 'access_token'); // a public client identifies itself in the body
        const revocations = seen.filter((s) => s.url === `${tenant.issuer}/oauth/revoke`);
        expect(Object.fromEntries(revocations[0]!.form)).toEqual({token: 'rt_1', token_type_hint: 'refresh_token'});
        expect(revocations[0]!.auth).toMatch(/^Basic /);
        expect(Object.fromEntries(revocations[1]!.form)).toEqual({token: 'at_1', token_type_hint: 'access_token', client_id: 'app_1'});

        answerRevocation(() => Response.json({error: 'invalid_client', error_description: 'bad secret'}, {status: 401}));
        await expect(auth('wrong').revoke('rt_1')).rejects.toMatchObject({code: 'invalid_client', status: 401});
        answerRevocation(() => new Response('upstream', {status: 503}));
        const error = await auth().revoke('rt_1').catch((e: unknown) => e);
        expect(error).toBeInstanceOf(NineError);
        expect(error).toMatchObject({code: 'revocation_failed', status: 503, message: 'revocation_failed: HTTP 503'});
    });

    it('keeps fresh token sets, refuses refresh without a refresh token', async () => {
        const {auth} = tenantWithEndpoints();
        const fresh = {accessToken: 'a', idToken: null, refreshToken: null, expiresAt: Date.now() + 120_000, scope: ''};
        expect(await auth().ensureFresh(fresh)).toBe(fresh);
        await expect(auth().ensureFresh(fresh, 180_000)).rejects.toMatchObject({code: 'login_required'});
    });

    it('rejects 9in errors, missing codes and expired logins in the callback', async () => {
        const {auth} = tenantWithEndpoints();
        const client = auth();
        const {pending} = await client.createLogin();
        await expect(client.handleCallback({error: 'access_denied', error_description: 'no', state: pending.state}, pending)).rejects.toMatchObject({code: 'access_denied', status: 400});
        await expect(client.handleCallback({state: pending.state}, pending)).rejects.toMatchObject({code: 'missing_code'});
        await expect(client.handleCallback({code: 'c', state: pending.state}, {...pending, createdAt: Date.now() - 2 * 3600_000})).rejects.toMatchObject({code: 'invalid_state'});
        await expect(client.handleCallback(new URLSearchParams({code: 'c', state: pending.state}), undefined)).rejects.toMatchObject({code: 'invalid_state'});
    });
});

describe('verifyWebhookMiddleware', () => {
    const secret = 'whsec_mw';
    const event = {id: 'evt_9', event: 'user.updated', created_at: '2026-11-09T10:00:00.000Z', tenant: 'tnt_1', environment: 'production', data: {fields: ['name'], user: {id: 'usr_1'}}};

    it('exposes the verified event and answers 401 otherwise', async () => {
        const mw = verifyWebhookMiddleware([secret, 'whsec_old']);
        const url = await start((req, res) =>
            mw(req as WebhookRequest, res, () => {
                res.statusCode = 200;
                res.end(JSON.stringify((req as WebhookRequest).nineEvent));
            }),
        );
        const body = JSON.stringify(event);
        const ok = await fetch(`${url}/hooks?x=1`, {method: 'POST', headers: {'9in-signature': await signPayload('whsec_old', 'POST', '/hooks', body)}, body});
        expect(ok.status).toBe(200);
        expect(await ok.json()).toEqual(event);
        const bad = await fetch(`${url}/hooks`, {method: 'POST', headers: {'9in-signature': await signPayload('whsec_other', 'POST', '/hooks', body)}, body});
        expect(bad.status).toBe(401);
        expect(await bad.json()).toMatchObject({error: 'invalid_signature'});
    });

    it('verifies against a configured path when a proxy rewrote it', async () => {
        const mw = verifyWebhookMiddleware(secret, {path: '/public/hooks'});
        const url = await start((req, res) => mw(req as WebhookRequest, res, () => void res.end('ok')));
        const body = JSON.stringify(event);
        expect((await fetch(`${url}/internal`, {method: 'POST', headers: {'9in-signature': await signPayload(secret, 'POST', '/public/hooks', body)}, body})).status).toBe(200);
    });
});

describe('requireAuth optional mode', () => {
    const tenant = fakeTenant();
    const guard = requireAuth({issuer: tenant.issuer, audience: 'https://api.acme.test', optional: true, fetch: tenant.fetch});

    async function call(headers: Record<string, string>) {
        const url = await start((req, res) =>
            guard(req as AuthenticatedRequest, res, () => {
                res.end(JSON.stringify({sub: (req as AuthenticatedRequest).auth?.sub ?? null}));
            }),
        );
        return fetch(url, {headers});
    }

    it('continues without a token, but still refuses a bad one', async () => {
        expect(await (await call({})).json()).toEqual({sub: null});
        expect(await (await call({Authorization: `Bearer ${tenant.sign({})}`})).json()).toEqual({sub: 'usr_1'});
        const bad = await call({Authorization: 'Bearer not-a-token'});
        expect(bad.status).toBe(401);
        expect(bad.headers.get('www-authenticate')).toContain('invalid_token');
    });
});
