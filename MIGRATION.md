# Migrating from `@ssofy/node-sdk` 2.x to `@9in/node` 3.x

SSOfy is now [9in](https://9in.io). 3.0 is a new major version under a new package name,
built on [`@9in/sdk`](https://www.npmjs.com/package/@9in/sdk) (the single 9in
JavaScript SDK) and speaking the 9in v2 protocol.

**Upgrading is required to use 9in.** `@ssofy/node-sdk` 2.x only talks to the SSOfy service (the signed `/v1/*` API and the 8-endpoint resource server). That service has shut down (ssofy.com has lapsed), and 9in does not serve the SSOfy v1 protocol, so 2.x does not work against 9in. The old versions stay published but are no longer maintained. Move to 3.x as part of moving the app to 9in.

```bash
npm uninstall @ssofy/node-sdk @ssofy/javascript-sdk
npm install @9in/node
```

Node.js 20.19+ is required.

## API mapping

| 2.x | 3.x |
|---|---|
| `new APIClient(new APIConfig({domain, key, secret}))` | Not needed for token checks: `verifyAccessToken(token, {issuer, audience, scope})` or `requireAuth()` |
| `APIClient.verifyAuthentication(token)` | `requireAuth({issuer, clientId, clientSecret})` (hybrid: local check + cached introspection) or `verifyAccessToken(token, {issuer})` (local only); every key-library algorithm |
| `APIClient.authenticatedUser(token)` | Claims from `verifyAccessToken`, or `ServerAuth.userInfo(token)` |
| `APIClient.findUserById(id)` | `new ManagementClient({issuer, clientId, clientSecret}).getUser(id)` |
| `APIClient.invalidateTokenCache()`, `purgeTokenCache()` | `verifier.handleEvent(event)` / `webhookHandler(…, {verifier})` on `token.revoked`, `session.revoked`, `user.*`; `verifier.clear()` |
| `OAuth2Client` / `OAuth2Config` (re-exported from `@ssofy/javascript-sdk`) | `ServerAuth` on the server, `NineAuth` from `@9in/sdk` in the browser |
| `OAuth2Client.initAuthCodeFlow(url, next)` | `ServerAuth.createLogin({returnTo})` → `{url, pending}` (keep `pending` in the session) |
| `OAuth2Client.handleCallback(payload)` | `ServerAuth.handleCallback(req.originalUrl, pending)` |
| `OAuth2Client.getAccessToken(state)` / `renewAccessToken(state)` | `ServerAuth.ensureFresh(tokens)` / `refresh(tokens)` |
| `Storage.*` (state stores) | Not needed: you keep `pending` and the token set in your session |
| `SignatureGenerator`, `SignatureVerifier`, `Models.Signature` | `signPayload()`, `verifySignature()` (`9in-signature: t=…,v1=…`) |
| `Errors.APIError`, `InvalidTokenError`, `SignatureVerificationError` | `NineError` (`code`, `status`) |
| `Notifications.*` notifiers and templates | Unchanged (now `import type` of provider SDKs); use with `otpSender()` |
| `Events.*` channels | Unchanged |
| `Repositories.*` (`Client`, `Scope`, `OTP`, `SocialLink`, `User`), `Datasource.*`, `Filters.*`, `Transformers.*`, `Models.*Entity`, `Helpers.*` | Removed. Adapter v2 needs `authenticate`, `findUser` and `onEvent` only (`adapterMiddleware()` / `adapterHandler()`). Applications, scopes, social login and one-time codes live in 9in |

## Resource server → adapter v2

| SSOfy endpoint | 9in |
|---|---|
| `auth/password` | `authenticate(identifier, password)` → user / `'invalid'` / `'blocked'` |
| `user` | `findUser({id} | {identifier})` |
| `event` | `onEvent(event)`; `otp.requested` carries the code to deliver (`otpSender()`) |
| `client`, `scopes`, `otp-options`, `auth/social`, `users` | Gone (9in console) |
| `auth/token` | `ManagementClient.createLoginLink()` |

User objects use OIDC claim names (`phone_number`, `email_verified`, `picture`,
`metadata`…) instead of `UserEntity` (`phone`, `display_name`, `hash`, `additional`).

## Signatures

SSOfy signed `base64(json{hash, salt})` over the URL path and concatenated values, with no
expiry. 9in signs `t.METHOD.path.rawBody` with HMAC-SHA256 in `9in-signature`, rejects
requests older than five minutes, and binds adapter responses to `9in-request-id`.
Signatures cover the raw body, so mount 9in handlers before `express.json()`.

## Environment

`SSOFY_URL`, `SSOFY_CLIENT_ID`, `SSOFY_CLIENT_SECRET`, `SSOFY_API_SECRET` are still read by
`env()` / `configFromEnv()` when the `NINE_*` names are not set.
