import {describe, expect, it} from '@jest/globals';
import {NineError, ServerAuth, codeChallenge} from '../index';
import {fakeTenant} from './helpers';

function setup(withSecret = true, idAlg = 'RS256') {
    const tenant = fakeTenant();
    const idSigner = idAlg === 'RS256' ? (claims: Record<string, unknown>, header: Record<string, unknown>) => tenant.sign(claims, undefined, header) : tenant.keyFor(idAlg);
    let nonce = '';
    const forms: {form: URLSearchParams; auth: string | null}[] = [];
    tenant.onToken((form, init) => {
        forms.push({form, auth: new Headers(init?.headers).get('authorization')});
        if (form.get('refresh_token') === 'rt_dead') return new Response(JSON.stringify({error: 'invalid_grant'}), {status: 400});
        return {
            access_token: `at_${form.get('grant_type')}`,
            refresh_token: 'rt_next',
            expires_in: 900,
            scope: 'openid profile email offline_access',
            ...(form.get('grant_type') === 'authorization_code' ? {id_token: idSigner({aud: 'app_1', nonce, email: 'jane@acme.test'}, {typ: 'JWT'})} : {}),
        };
    });
    const auth = new ServerAuth({
        issuer: tenant.issuer,
        clientId: 'app_1',
        clientSecret: withSecret ? 's3cr3t' : undefined,
        redirectUri: 'https://app.acme.test/callback',
        audience: 'https://api.acme.test',
        fetch: tenant.fetch,
    });
    return {tenant, auth, forms, setNonce: (value: string) => (nonce = value)};
}

describe('ServerAuth', () => {
    it('matches the RFC 7636 PKCE example', () => {
        expect(codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
    });

    it('builds the authorization URL', async () => {
        const {auth, tenant} = setup();
        const {url, pending} = await auth.createLogin({returnTo: '/dashboard', screen: 'signup', loginHint: 'jane@acme.test'});
        const params = new URL(url).searchParams;
        expect(url.startsWith(`${tenant.issuer}/oauth/authorize?`)).toBe(true);
        expect(params.get('code_challenge')).toBe(codeChallenge(pending.verifier));
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(params.get('state')).toBe(pending.state);
        expect(params.get('nonce')).toBe(pending.nonce);
        expect(params.get('prompt')).toBe('create');
        expect(params.get('audience')).toBe('https://api.acme.test');
        expect(params.get('scope')).toBe('openid profile email offline_access');
    });

    it('completes the callback as a confidential client', async () => {
        const {auth, tenant, forms, setNonce} = setup();
        const {pending} = await auth.createLogin({returnTo: '/dashboard'});
        setNonce(pending.nonce);
        const tokens = await auth.handleCallback(`/callback?code=c0de&state=${pending.state}&iss=${encodeURIComponent(tenant.issuer)}`, pending);

        expect(tokens.accessToken).toBe('at_authorization_code');
        expect(tokens.returnTo).toBe('/dashboard');
        expect(auth.claims(tokens).email).toBe('jane@acme.test');
        expect(forms[0]!.form.get('code_verifier')).toBe(pending.verifier);
        expect(forms[0]!.auth).toBe(`Basic ${Buffer.from('app_1:s3cr3t').toString('base64')}`);
        expect(forms[0]!.form.get('client_id')).toBeNull();
    });

    it('sends client_id in the body for public clients', async () => {
        const {auth, forms, setNonce} = setup(false);
        const {pending} = await auth.createLogin();
        setNonce(pending.nonce);
        await auth.handleCallback({code: 'c', state: pending.state}, pending);
        expect(forms[0]!.form.get('client_id')).toBe('app_1');
        expect(forms[0]!.auth).toBeNull();
    });

    it('rejects wrong state, nonce and issuer', async () => {
        const {auth, setNonce} = setup();
        const {pending} = await auth.createLogin();
        await expect(auth.handleCallback({code: 'c', state: 'forged'}, pending)).rejects.toMatchObject({code: 'invalid_state'});
        await expect(auth.handleCallback({code: 'c', state: pending.state}, null)).rejects.toMatchObject({code: 'invalid_state'});
        await expect(auth.handleCallback({code: 'c', state: pending.state, iss: 'https://evil.test'}, pending)).rejects.toMatchObject({code: 'invalid_issuer'});
        setNonce('another');
        await expect(auth.handleCallback({code: 'c', state: pending.state}, pending)).rejects.toMatchObject({code: 'invalid_id_token'});
        await expect(auth.handleCallback({error: 'access_denied', state: pending.state}, pending)).rejects.toBeInstanceOf(NineError);
    });

    it('refreshes with rotation and reports invalid_grant', async () => {
        const {auth} = setup();
        const refreshed = await auth.ensureFresh({accessToken: 'old', idToken: 'id', refreshToken: 'rt_old', expiresAt: Date.now() - 1, scope: 'openid'});
        expect(refreshed).toMatchObject({accessToken: 'at_refresh_token', refreshToken: 'rt_next', idToken: 'id'});
        await expect(auth.refresh({accessToken: 'a', idToken: null, refreshToken: 'rt_dead', expiresAt: 0, scope: ''})).rejects.toMatchObject({code: 'invalid_grant', status: 400});
    });

    it.each(['PS256', 'ES256', 'ES384', 'EdDSA'])('verifies %s ID tokens', async (alg) => {
        const {auth, setNonce} = setup(true, alg);
        const {pending} = await auth.createLogin();
        setNonce(pending.nonce);
        const tokens = await auth.handleCallback({code: 'c', state: pending.state}, pending);
        expect(auth.claims(tokens).email).toBe('jane@acme.test');
    });

    it('refuses plain-http issuers', () => {
        expect(() => new ServerAuth({issuer: 'http://acme.9in.io', clientId: 'a'})).toThrow(NineError);
        expect(() => new ServerAuth({issuer: 'http://localhost:8787', clientId: 'a'})).not.toThrow();
    });

    it('builds the logout URL', async () => {
        const {auth, tenant} = setup();
        const url = new URL(await auth.logoutUrl({idToken: 'id.tok', returnTo: 'https://app.acme.test/'}));
        expect(url.origin + url.pathname).toBe(`${tenant.issuer}/oauth/logout`);
        expect(url.searchParams.get('id_token_hint')).toBe('id.tok');
        expect(url.searchParams.get('post_logout_redirect_uri')).toBe('https://app.acme.test/');
    });
});
