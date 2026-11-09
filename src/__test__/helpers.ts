import {constants, createHmac, generateKeyPairSync, createSign, sign as cryptoSign, type KeyObject} from 'node:crypto';
import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import type {AddressInfo} from 'node:net';

let counter = 0;

/** A fake 9in tenant behind a fetch function (unique issuer per instance: the SDK caches per issuer). */
export function fakeTenant() {
    const issuer = `https://tenant${++counter}.9in.test`;
    const {privateKey, publicKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
    const jwk = {...(publicKey.export({format: 'jwk'}) as Record<string, string>), kid: 'k1', alg: 'RS256', use: 'sig'};
    const calls: {url: string; init?: RequestInit}[] = [];
    const keys: Record<string, unknown>[] = [jwk];
    const introspected: string[] = [];
    let tokenHandler: (form: URLSearchParams, init?: RequestInit) => Record<string, unknown> | Response = () => ({access_token: 'at', expires_in: 900});
    let introspection: (token: string) => Record<string, unknown> = () => ({active: true});

    const claimsFor = (claims: Record<string, unknown>) => {
        const now = Math.floor(Date.now() / 1000);
        return {iss: issuer, sub: 'usr_1', aud: 'https://api.acme.test', client_id: 'app_1', scope: 'openid orders:read', sid: 'sid_1', jti: 'jti_1', iat: now, exp: now + 600, ...claims};
    };
    const encode = (header: Record<string, unknown>, payload: Record<string, unknown>) =>
        `${Buffer.from(JSON.stringify(header)).toString('base64url')}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;

    /** RS256 access token (typ at+jwt); pass header {typ: 'JWT'} for an ID token. */
    const sign = (claims: Record<string, unknown> = {}, key: KeyObject = privateKey, header: Record<string, unknown> = {}) => {
        const input = encode({alg: 'RS256', kid: 'k1', typ: 'at+jwt', ...header}, claimsFor(claims));
        return `${input}.${createSign('RSA-SHA256').update(input).sign(key).toString('base64url')}`;
    };

    /** Adds a key for `alg` to the JWKS and returns a signer for it (HS*: signs with `secret`). */
    const keyFor = (alg: string, options: {kid?: string; jwkAlg?: string | null; secret?: string} = {}) => {
        const kid = options.kid ?? `k-${alg}`;
        const hash = {'256': 'sha256', '384': 'sha384', '512': 'sha512'}[alg.slice(2)];
        let signBytes: (input: string) => Buffer;
        if (alg.startsWith('HS')) {
            signBytes = (input) => createHmac(hash!, options.secret ?? 'secret').update(input).digest();
        } else {
            const pair =
                alg.startsWith('RS') || alg.startsWith('PS')
                    ? generateKeyPairSync('rsa', {modulusLength: 2048})
                    : alg === 'ES256'
                      ? generateKeyPairSync('ec', {namedCurve: 'P-256'})
                      : alg === 'ES384'
                        ? generateKeyPairSync('ec', {namedCurve: 'P-384'})
                        : generateKeyPairSync('ed25519');
            const publicJwk: Record<string, unknown> = {...(pair.publicKey.export({format: 'jwk'}) as Record<string, unknown>), kid, use: 'sig'};
            if (options.jwkAlg !== null) publicJwk.alg = options.jwkAlg ?? alg;
            keys.push(publicJwk);
            signBytes = (input) =>
                alg === 'EdDSA'
                    ? cryptoSign(null, Buffer.from(input), pair.privateKey)
                    : alg.startsWith('PS')
                      ? cryptoSign(hash!, Buffer.from(input), {key: pair.privateKey, padding: constants.RSA_PKCS1_PSS_PADDING, saltLength: Number(alg.slice(2)) / 8})
                      : alg.startsWith('ES')
                        ? cryptoSign(hash!, Buffer.from(input), {key: pair.privateKey, dsaEncoding: 'ieee-p1363'})
                        : cryptoSign(hash!, Buffer.from(input), pair.privateKey);
        }
        return (claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}) => {
            const input = encode({alg, kid, typ: 'at+jwt', ...header}, claimsFor(claims));
            return `${input}.${signBytes(input).toString('base64url')}`;
        };
    };

    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        calls.push({url, init});
        const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});
        if (url === `${issuer}/.well-known/openid-configuration`) {
            return json({
                issuer,
                authorization_endpoint: `${issuer}/oauth/authorize`,
                token_endpoint: `${issuer}/oauth/token`,
                userinfo_endpoint: `${issuer}/oauth/userinfo`,
                jwks_uri: `${issuer}/.well-known/jwks.json`,
                revocation_endpoint: `${issuer}/oauth/revoke`,
                introspection_endpoint: `${issuer}/oauth/introspect`,
                end_session_endpoint: `${issuer}/oauth/logout`,
            });
        }
        if (url === `${issuer}/.well-known/jwks.json`) return json({keys});
        if (url === `${issuer}/oauth/introspect`) {
            const token = new URLSearchParams(String(init?.body ?? '')).get('token')!;
            introspected.push(token);
            return json(introspection(token));
        }
        if (url === `${issuer}/oauth/token`) {
            const result = tokenHandler(new URLSearchParams(String(init?.body ?? '')), init);
            return result instanceof Response ? result : json(result);
        }
        if (url === `${issuer}/oauth/revoke`) return new Response(null, {status: 200});
        return json({error: 'not_found'}, 404);
    }) as typeof fetch;

    return {
        issuer,
        fetch: fetcher,
        sign,
        keyFor,
        claimsFor,
        calls,
        introspected,
        onToken(handler: typeof tokenHandler) {
            tokenHandler = handler;
        },
        onIntrospect(handler: typeof introspection) {
            introspection = handler;
        },
    };
}

/** Starts a node:http server for one handler; returns its base URL and a close function. */
export async function serve(handler: (req: IncomingMessage, res: ServerResponse) => void) {
    const server = createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const {port} = server.address() as AddressInfo;
    return {url: `http://127.0.0.1:${port}`, close: () => new Promise<void>((resolve) => server.close(() => resolve()))};
}
