9in Node.js SDK
===============

<img src="docs/img/logo.png" width="160" alt="9in"/>

Official Node.js SDK for [9in](https://9in.io), built on [`@9in/sdk`](https://www.npmjs.com/package/@9in/sdk).

`@9in/node` re-exports everything from `@9in/sdk/server` and adds what only Node needs:

- **`verifyAccessToken`, `ManagementClient`, `adapterHandler`, `verifyWebhook`** (from `@9in/sdk`).
- **`requireAuth()`**: Express / Connect middleware that verifies access tokens locally against
  your tenant's JWKS.
- **`webhookHandler()` / `verifyWebhookMiddleware()`**: signed webhooks for node:http and Express.
- **`adapterMiddleware()`**: adapter protocol v2 (`/authenticate`, `/user`, `/event`) for
  node:http and Express, with signed responses.
- **`ServerAuth`**: server-side sign-in for web apps (authorization code + PKCE, confidential
  client, refresh rotation, logout).
- **`otpSender()` + notifiers** (Nodemailer, SendGrid, Mailgun, Mailchimp, SES, Twilio,
  Vonage, console) to deliver one-time codes for adapter users.
- **`env()`**: `NINE_*` settings with the old `SSOFY_*` names as fallbacks.

Requires Node.js 20.19+ (it `require()`s the ESM `@9in/sdk`).

```bash
npm install @9in/node
```

Writing a browser app? Use `@9in/sdk` (`NineAuth`) directly. Upgrading from
`@ssofy/node-sdk` 2.x? Read [MIGRATION.md](MIGRATION.md).

## Protect an API

```ts
import express from 'express';
import {requireAuth, type AuthenticatedRequest} from '@9in/node';

const app = express();
const auth = requireAuth({issuer: 'https://acme.9in.io', audience: 'https://api.acme.com'});

app.get('/api/orders', auth, (req: AuthenticatedRequest, res) => {
    res.json({user: req.auth!.sub, client: req.auth!.client_id});
});

app.post('/api/orders', requireAuth({issuer, audience, scope: 'orders:write'}), handler);   // 403 without the scope
```

Missing, expired or foreign tokens get `401` with `WWW-Authenticate`. Pass
`optional: true` to let anonymous requests through without `req.auth`.

- **Every key-library algorithm** is accepted (RS/PS/ES/EdDSA from your tenant's JWKS, and
  HS256/384/512 with `secret`). Only access tokens (`typ: at+jwt`) are accepted.
- **Revocations take effect at once (hybrid mode).** Give `requireAuth` a confidential
  application's credentials and wire its verifier to your webhook endpoint:

  ```ts
  const auth = requireAuth({issuer, audience, clientId, clientSecret});   // mode: 'hybrid' (the default with credentials)
  app.get('/api/orders', auth, handler);
  app.post('/webhooks/9in', webhookHandler(process.env.NINE_WEBHOOK_SECRET!, onEvent, {verifier: auth.verifier, dedupe: true}));
  ```

  - **Hybrid mode:** each token is checked locally and introspected once. The answer is
    cached (`cacheTtl`, default 300 s) and dropped when `token.revoked`,
    `session.revoked` or a `user.*` event arrives.
  - **Other modes:** `mode: 'local'` (the default without credentials) skips
    introspection; `'introspect'` asks 9in on every request.
  - **Opaque tokens:** `9in_at_…` tokens are introspected.
  - **Errors:** introspection failures go to `next(error)` (a 500), not 401.

## Sign users in (server-rendered apps)

```ts
import session from 'express-session';
import {ServerAuth} from '@9in/node';

const auth = new ServerAuth({
    issuer: process.env.NINE_ISSUER!,
    clientId: process.env.NINE_CLIENT_ID!,
    clientSecret: process.env.NINE_CLIENT_SECRET,
    redirectUri: 'https://app.acme.com/callback',
});

app.get('/login', async (req, res) => {
    const {url, pending} = await auth.createLogin({returnTo: req.query.returnTo as string});   // screen: 'signup' for registration
    req.session.nineLogin = pending;
    res.redirect(url);
});

app.get('/callback', async (req, res) => {
    const tokens = await auth.handleCallback(req.originalUrl, req.session.nineLogin);   // checks state, iss, PKCE, ID token (any asymmetric key)
    req.session.nineLogin = undefined;
    req.session.tokens = tokens;
    req.session.user = auth.claims(tokens);
    res.redirect(tokens.returnTo ?? '/');
});

// later: tokens = await auth.ensureFresh(req.session.tokens)  (refresh tokens rotate)
app.get('/logout', async (req, res) => {
    const tokens = req.session.tokens;
    if (tokens?.refreshToken) await auth.revoke(tokens.refreshToken);
    req.session.destroy(() => undefined);
    res.redirect(await auth.logoutUrl({idToken: tokens?.idToken, returnTo: 'https://app.acme.com/'}));
});
```

## Manage users

```ts
import {ManagementClient} from '@9in/node';

const nine = new ManagementClient({issuer, clientId, clientSecret});   // application with management scopes
await nine.createUser({email: 'jane@acme.com', password: '…', emailVerified: true});
const {url} = await nine.createLoginLink(userId, {returnTo: 'https://app.acme.com/callback'});   // replaces SSOfy auth/token
```

## Webhooks

```ts
import {webhookHandler} from '@9in/node';

// Mount before express.json(): the signature covers the raw body.
app.post('/webhooks/9in', webhookHandler(process.env.NINE_WEBHOOK_SECRET!, async (event) => {
    if (event.type === 'user.created') { /* event.data.user */ }
}));
```

The handler answers `204`, `401` for bad signatures, and `500` when your callback throws
(so 9in retries). `event.id` is stable across retries; pass `{dedupe: true}` (one process) or
`{dedupe: store}` with a shared `EventStore` (Redis `SET NX EX`, your database) to call your
callback once per event. Retries of a processed event then get `204` without calling it, and
a retry that arrives while the first delivery is still running gets `409`.

## Keep users in your own database (adapter v2)

```ts
import {adapterMiddleware, otpSender, Notifications} from '@9in/node';

const sendOtp = otpSender({
    email: new Notifications.NodemailerEmailNotifier(transporter, Notifications.Channel.EMAIL, 'no-reply@acme.com', [{name: 'otp', channel: Notifications.Channel.EMAIL, path: './otp.email.hbs', engine: new Notifications.HandlebarsEngine()}]),
    sms: new Notifications.TwilioSMSNotifier(twilio, '+15550000000', [{name: 'otp', channel: Notifications.Channel.SMS, path: './otp.sms.hbs', engine: new Notifications.HandlebarsEngine()}]),
});

// Before express.json(). Set the adapter URL in the console to https://your-app.com/nine
app.use('/nine', adapterMiddleware({
    secret: process.env.NINE_ADAPTER_SECRET!,                // [new, old] during rotation
    async authenticate({type, value}, password) {
        const user = await db.users.findByLogin(type, value);
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) return 'invalid';
        return user.disabled ? 'blocked' : toAdapterUser(user);
    },
    async findUser(query) {
        const user = 'id' in query ? await db.users.findById(query.id) : await db.users.findByLogin(query.identifier.type, query.identifier.value);
        return user ? toAdapterUser(user) : null;
    },
    async onEvent(event) {
        await sendOtp(event);   // otp.requested → email / SMS (template data: code, purpose, expiresAt, to)
    },
}));
```

For a ready-made Express router with these pieces, see
[`@9in/express-server`](https://github.com/9in-io/express-server). On Workers, Deno, Bun or
Next.js route handlers use `adapterHandler` from `@9in/sdk/server` directly.

## Configuration

| Variable | Fallback |
|---|---|
| `NINE_ISSUER` | `SSOFY_URL` |
| `NINE_CLIENT_ID`, `NINE_CLIENT_SECRET` | `SSOFY_CLIENT_ID`, `SSOFY_CLIENT_SECRET` |
| `NINE_ADAPTER_SECRET` | `SSOFY_ADAPTER_SECRET`, `SSOFY_API_SECRET` |
| `NINE_WEBHOOK_SECRET` | `SSOFY_WEBHOOK_SECRET` |

`env('ISSUER')` reads them; `configFromEnv()` returns all of them; `envSource('ISSUER')`
tells you which variable was used.

Issuers must use `https://`: `ServerAuth`, `requireAuth`, `verifyAccessToken` and
`ManagementClient` throw `insecure_issuer` otherwise (at setup, not per request). Plain http
is accepted for `localhost`, `*.localhost` and loopback addresses; pass
`allowInsecureIssuer: true` for other development hosts.

## Development

```bash
npm install     # links @9in/sdk from ../../v2/packages/sdk (see package.json)
npm test        # jest; includes an interop test against ../php (9in/php-sdk) when PHP is installed
npm run build
```

`legacy/v1-toolkit/` holds the SSOfy 2.x datasource/repository toolkit (with an unfinished
refactor). It is not built or published.

## License

The MIT License (MIT). See [LICENSE](LICENSE). 9in and SSOfy are by [Cubelet Ltd](https://cubelet.co.uk).
