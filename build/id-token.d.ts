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
/**
 * A key from the tenant's JWKS: the members read here, and the rest as they come. Its own type,
 * not one from @types/node, which renamed its JWK types between versions (this type is in the
 * published .d.ts, so it has to compile against all of them).
 */
interface Jwk {
    kty?: string;
    crv?: string;
    kid?: string;
    alg?: string;
    [member: string]: unknown;
}
export declare function verifySignatureWithJwk(alg: string, jwk: Jwk, input: string, signature: Buffer): boolean;
export declare function verifyIdToken(idToken: string, options: VerifyIdTokenOptions): Promise<Record<string, unknown>>;
export {};
