import {createPublicKey, verify as cryptoVerify, type JsonWebKey, type KeyObject} from 'node:crypto';
import {NineError, normalizeIssuer} from '@9in/sdk/server';

/**
 * ID token verification for server-side sign-in. `verifyAccessToken` only accepts access
 * tokens (`typ: at+jwt`), so ID tokens are checked here with node:crypto: every asymmetric
 * algorithm 9in signs with (RS256/384/512, PS256/384/512, ES256, ES384, EdDSA) against the
 * tenant's JWKS, then issuer, audience (the client id), expiry and nonce.
 */

export interface VerifyIdTokenOptions {
    issuer: string;
    clientId: string;
    nonce?: string;
    clockTolerance?: number;
    allowInsecureIssuer?: boolean;
    fetch?: typeof fetch;
}

interface Jwk extends JsonWebKey {
    kid?: string;
    alg?: string;
}

const HASH: Record<string, string> = {RS256: 'sha256', RS384: 'sha384', RS512: 'sha512', PS256: 'sha256', PS384: 'sha384', PS512: 'sha512', ES256: 'sha256', ES384: 'sha384'};
const SALT: Record<string, number> = {PS256: 32, PS384: 48, PS512: 64};
const KEY_TYPE: Record<string, (jwk: Jwk) => boolean> = {
    RS256: (k) => k.kty === 'RSA', RS384: (k) => k.kty === 'RSA', RS512: (k) => k.kty === 'RSA',
    PS256: (k) => k.kty === 'RSA', PS384: (k) => k.kty === 'RSA', PS512: (k) => k.kty === 'RSA',
    ES256: (k) => k.kty === 'EC' && k.crv === 'P-256', ES384: (k) => k.kty === 'EC' && k.crv === 'P-384',
    EdDSA: (k) => k.kty === 'OKP' && k.crv === 'Ed25519',
};

const jwksCache = new Map<string, {keys: Jwk[]; fetchedAt: number}>();

async function fetchKeys(issuer: string, fetcher: typeof fetch, force: boolean): Promise<Jwk[]> {
    const hit = jwksCache.get(issuer);
    if (hit && !force && Date.now() - hit.fetchedAt < 10 * 60_000) return hit.keys;
    const discovery = await fetcher(`${issuer}/.well-known/openid-configuration`);
    if (!discovery.ok) throw new NineError('discovery_failed', `HTTP ${discovery.status}`, discovery.status);
    const {jwks_uri} = (await discovery.json()) as {jwks_uri: string};
    const res = await fetcher(jwks_uri);
    if (!res.ok) throw new NineError('jwks_unavailable', `HTTP ${res.status}`, res.status);
    const {keys} = (await res.json()) as {keys: Jwk[]};
    jwksCache.set(issuer, {keys, fetchedAt: Date.now()});
    return keys;
}

function part(token: string, index: number): Record<string, unknown> {
    try {
        return JSON.parse(Buffer.from(token.split('.')[index] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    } catch {
        throw new NineError('invalid_id_token', 'malformed token', 401);
    }
}

export function verifySignatureWithJwk(alg: string, jwk: Jwk, input: string, signature: Buffer): boolean {
    const key: KeyObject = createPublicKey({key: jwk, format: 'jwk'});
    if (alg === 'EdDSA') return cryptoVerify(null, Buffer.from(input), key, signature);
    const hash = HASH[alg];
    if (!hash) return false;
    if (alg.startsWith('PS')) return cryptoVerify(hash, Buffer.from(input), {key, padding: 6 /* RSA_PKCS1_PSS_PADDING */, saltLength: SALT[alg]}, signature);
    if (alg.startsWith('ES')) return cryptoVerify(hash, Buffer.from(input), {key, dsaEncoding: 'ieee-p1363'}, signature);
    return cryptoVerify(hash, Buffer.from(input), key, signature);
}

export async function verifyIdToken(idToken: string, options: VerifyIdTokenOptions): Promise<Record<string, unknown>> {
    const issuer = normalizeIssuer(options.issuer, options.allowInsecureIssuer);
    const fetcher = options.fetch ?? fetch.bind(globalThis);
    if (idToken.split('.').length !== 3) throw new NineError('invalid_id_token', 'malformed token', 401);
    const header = part(idToken, 0);
    const payload = part(idToken, 1);
    const alg = String(header.alg);
    if (!KEY_TYPE[alg]) throw new NineError('invalid_id_token', 'unsupported algorithm', 401);

    let jwk = (await fetchKeys(issuer, fetcher, false)).find((k) => k.kid === header.kid);
    if (!jwk) jwk = (await fetchKeys(issuer, fetcher, true)).find((k) => k.kid === header.kid);
    if (!jwk) throw new NineError('invalid_id_token', 'unknown signing key', 401);
    if ((jwk.alg && jwk.alg !== alg) || !KEY_TYPE[alg]!(jwk)) throw new NineError('invalid_id_token', 'algorithm does not match the key', 401);

    const [h, p, s] = idToken.split('.');
    if (!verifySignatureWithJwk(alg, jwk, `${h}.${p}`, Buffer.from(s!, 'base64url'))) throw new NineError('invalid_id_token', 'bad signature', 401);

    const now = Math.floor(Date.now() / 1000);
    const skew = options.clockTolerance ?? 30;
    if (String(payload.iss).replace(/\/$/, '') !== issuer) throw new NineError('invalid_id_token', 'issuer mismatch', 401);
    if (typeof payload.exp !== 'number' || payload.exp + skew < now) throw new NineError('invalid_id_token', 'token expired', 401);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(options.clientId)) throw new NineError('invalid_id_token', 'audience mismatch', 401);
    if (options.nonce !== undefined && payload.nonce !== options.nonce) throw new NineError('invalid_id_token', 'nonce mismatch', 401);
    return payload;
}
