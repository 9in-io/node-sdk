"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifySignatureWithJwk = verifySignatureWithJwk;
exports.verifyIdToken = verifyIdToken;
const node_crypto_1 = require("node:crypto");
const server_1 = require("@9in-io/sdk/server");
const HASH = { RS256: 'sha256', RS384: 'sha384', RS512: 'sha512', PS256: 'sha256', PS384: 'sha384', PS512: 'sha512', ES256: 'sha256', ES384: 'sha384' };
const SALT = { PS256: 32, PS384: 48, PS512: 64 };
const KEY_TYPE = {
    RS256: (k) => k.kty === 'RSA', RS384: (k) => k.kty === 'RSA', RS512: (k) => k.kty === 'RSA',
    PS256: (k) => k.kty === 'RSA', PS384: (k) => k.kty === 'RSA', PS512: (k) => k.kty === 'RSA',
    ES256: (k) => k.kty === 'EC' && k.crv === 'P-256', ES384: (k) => k.kty === 'EC' && k.crv === 'P-384',
    EdDSA: (k) => k.kty === 'OKP' && k.crv === 'Ed25519',
};
const jwksCache = new Map();
async function fetchKeys(issuer, fetcher, force) {
    const hit = jwksCache.get(issuer);
    if (hit && !force && Date.now() - hit.fetchedAt < 10 * 60_000)
        return hit.keys;
    const discovery = await fetcher(`${issuer}/.well-known/openid-configuration`);
    if (!discovery.ok)
        throw new server_1.NineError('discovery_failed', `HTTP ${discovery.status}`, discovery.status);
    const { jwks_uri } = (await discovery.json());
    const res = await fetcher(jwks_uri);
    if (!res.ok)
        throw new server_1.NineError('jwks_unavailable', `HTTP ${res.status}`, res.status);
    const { keys } = (await res.json());
    jwksCache.set(issuer, { keys, fetchedAt: Date.now() });
    return keys;
}
function part(token, index) {
    try {
        return JSON.parse(Buffer.from(token.split('.')[index] ?? '', 'base64url').toString('utf8'));
    }
    catch {
        throw new server_1.NineError('invalid_id_token', 'malformed token', 401);
    }
}
function verifySignatureWithJwk(alg, jwk, input, signature) {
    const key = (0, node_crypto_1.createPublicKey)({ key: jwk, format: 'jwk' });
    if (alg === 'EdDSA')
        return (0, node_crypto_1.verify)(null, Buffer.from(input), key, signature);
    const hash = HASH[alg];
    if (!hash)
        return false;
    if (alg.startsWith('PS'))
        return (0, node_crypto_1.verify)(hash, Buffer.from(input), { key, padding: 6 /* RSA_PKCS1_PSS_PADDING */, saltLength: SALT[alg] }, signature);
    if (alg.startsWith('ES'))
        return (0, node_crypto_1.verify)(hash, Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }, signature);
    return (0, node_crypto_1.verify)(hash, Buffer.from(input), key, signature);
}
async function verifyIdToken(idToken, options) {
    const issuer = (0, server_1.normalizeIssuer)(options.issuer, options.allowInsecureIssuer);
    const fetcher = options.fetch ?? fetch.bind(globalThis);
    if (idToken.split('.').length !== 3)
        throw new server_1.NineError('invalid_id_token', 'malformed token', 401);
    const header = part(idToken, 0);
    const payload = part(idToken, 1);
    const alg = String(header.alg);
    if (!KEY_TYPE[alg])
        throw new server_1.NineError('invalid_id_token', 'unsupported algorithm', 401);
    let jwk = (await fetchKeys(issuer, fetcher, false)).find((k) => k.kid === header.kid);
    if (!jwk)
        jwk = (await fetchKeys(issuer, fetcher, true)).find((k) => k.kid === header.kid);
    if (!jwk)
        throw new server_1.NineError('invalid_id_token', 'unknown signing key', 401);
    if ((jwk.alg && jwk.alg !== alg) || !KEY_TYPE[alg](jwk))
        throw new server_1.NineError('invalid_id_token', 'algorithm does not match the key', 401);
    const [h, p, s] = idToken.split('.');
    if (!verifySignatureWithJwk(alg, jwk, `${h}.${p}`, Buffer.from(s, 'base64url')))
        throw new server_1.NineError('invalid_id_token', 'bad signature', 401);
    const now = Math.floor(Date.now() / 1000);
    const skew = options.clockTolerance ?? 30;
    if (String(payload.iss).replace(/\/$/, '') !== issuer)
        throw new server_1.NineError('invalid_id_token', 'issuer mismatch', 401);
    if (typeof payload.exp !== 'number' || payload.exp + skew < now)
        throw new server_1.NineError('invalid_id_token', 'token expired', 401);
    const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!aud.includes(options.clientId))
        throw new server_1.NineError('invalid_id_token', 'audience mismatch', 401);
    if (options.nonce !== undefined && payload.nonce !== options.nonce)
        throw new server_1.NineError('invalid_id_token', 'nonce mismatch', 401);
    return payload;
}
