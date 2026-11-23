9in Node.js SDK
===============

<img src="docs/img/logo.png" width="160" alt="9in"/>

Official Node.js SDK for [9in](https://9in.io), built on [`@9in-io/sdk`](https://www.npmjs.com/package/@9in-io/sdk).

`@9in-io/node` re-exports everything from `@9in-io/sdk/server` and adds what only Node needs:

- **`verifyAccessToken`, `ManagementClient`, `adapterHandler`, `verifyWebhook`** (from `@9in-io/sdk`).
- **`requireAuth()`**: Express / Connect middleware that verifies access tokens locally against
  your tenant's JWKS.
- **`webhookHandler()` / `verifyWebhookMiddleware()`**: signed webhooks for node:http and Express.
- **`adapterMiddleware()`**: adapter protocol v2 (`/authenticate`, `/user`, `/event`) for
  node:http and Express, with signed responses.
- **`ServerAuth`**: server-side sign-in for web apps (authorization code + PKCE, confidential
  client, refresh rotation, logout).
- **`otpSender()` + notifiers** (Nodemailer, SendGrid, Mailgun, Mailchimp, SES, Twilio,
  Vonage, console) to deliver one-time codes for adapter users.
- **`env()`** and **`configFromEnv()`**: `NINE_*` settings.

Requires Node.js 20.19+ (it `require()`s the ESM `@9in-io/sdk`).

```bash
npm install @9in-io/node
```

Writing a browser app? Use `@9in-io/sdk` (`NineAuth`) directly.

## Protect an API

```ts
import express from 'express';
import {requireAuth, type AuthenticatedRequest} from '@9in-io/node';

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
  app.post('/nine/webhook', webhookHandler(process.env.NINE_WEBHOOK_SECRET!, onEvent, {verifier: auth.verifier, dedupe: true}));
  ```

  - **Hybrid mode:** each token is checked locally and introspected once. The answer is
    cached (`cacheTtl`, default 300 s) and dropped when `token.revoked`,
    `session.revoked` or a `user.*` event arrives.
  - **Other modes:** `mode: 'local'` (the default without credentials) skips
    introspection; `'introspect'` asks 9in on every request.
  - **Opaque tokens:** `9in_at_…` tokens are introspected.
  - **Several processes:** pass a shared `store` (below), so a revocation reaches them all.
  - **Errors:** introspection failures go to `next(error)` (a 500), not 401.

### Several processes: a shared store

By default each process keeps its answers in memory, so a revocation webhook only reaches the
process that receives it. Give every process the same store: the one that gets the webhook writes
a small revocation marker (for the token's `jti`, the session's `sid` or the user), and every
process checks the markers before trusting a cached answer. The same store makes each webhook run
once across processes.

```ts
import {createClient} from 'redis';   // or: import Redis from 'ioredis'
import {redisStore, requireAuth, webhookHandler} from '@9in-io/node';

const store = redisStore(await createClient({url: process.env.REDIS_URL}).connect());

const auth = requireAuth({issuer, audience, clientId, clientSecret, store});
app.post('/nine/webhook', webhookHandler(process.env.NINE_WEBHOOK_SECRET!, onEvent, {verifier: auth.verifier, dedupe: store}));
```

| Store | What you pass |
|---|---|
| `redisStore(client, {prefix?})` | A node-redis (v4, v5) or ioredis client. `add` is `SET NX EX`. Use an eviction policy that keeps keys until they expire (`noeviction` or `volatile-*`). |
| `dynamoStore({client, table})` | A `DynamoDBDocumentClient` (`@aws-sdk/lib-dynamodb`) and a table whose partition key is `pk` (a string), with TTL on `expires_at`. `add` is a conditional put. |
| Your own | Any object with `get`, `set`, `add` (atomic: only if the key is missing or expired), `delete` and optionally `getMany`. Not Workers KV, which is eventually consistent. |

When the store can't be read, the verifier asks 9in; when a revocation can't be written,
`webhookHandler` answers 500 so 9in delivers the event again.

## Sign users in (server-rendered apps)

```ts
import session from 'express-session';
import {ServerAuth} from '@9in-io/node';

const auth = new ServerAuth({
    issuer: process.env.NINE_ISSUER!,
    clientId: process.env.NINE_CLIENT_ID!,
    clientSecret: process.env.NINE_CLIENT_SECRET,
    redirectUri: 'https://app.acme.com/nine/callback',
});

app.get('/nine/login', async (req, res) => {
    const {url, pending} = await auth.createLogin({returnTo: req.query.return_to as string});   // screen: 'signup' for registration
    req.session.nineLogin = pending;
    res.redirect(url);
});

app.get('/nine/callback', async (req, res) => {
    const tokens = await auth.handleCallback(req.originalUrl, req.session.nineLogin);   // checks state, iss, PKCE, ID token (any asymmetric key)
    req.session.nineLogin = undefined;
    req.session.tokens = tokens;
    req.session.user = auth.claims(tokens);
    res.redirect(tokens.returnTo ?? '/');
});

// later: tokens = await auth.ensureFresh(req.session.tokens)  (refresh tokens rotate)
app.get('/nine/logout', async (req, res) => {
    const tokens = req.session.tokens;
    if (tokens?.refreshToken) await auth.revoke(tokens.refreshToken);
    req.session.destroy(() => undefined);
    res.redirect(await auth.logoutUrl({idToken: tokens?.idToken, returnTo: 'https://app.acme.com/'}));
});
```

## Manage users

```ts
import {ManagementClient} from '@9in-io/node';

const nine = new ManagementClient({issuer, clientId, clientSecret});   // application with management scopes
await nine.createUser({email: 'jane@acme.com', password: '…', email_verified: true});
const {url} = await nine.createLoginLink(userId, {returnTo: 'https://app.acme.com/nine/callback'});
```

Users, sessions and events use 9in's snake_case field names, the same going in and coming
out (`email_verified`, `phone_number`, `password_hash`), with ISO 8601 UTC times
(`created_at`, `last_login_at`).

## Webhooks

```ts
import {webhookHandler} from '@9in-io/node';

// Mount before express.json(): the signature covers the raw body.
app.post('/nine/webhook', webhookHandler(process.env.NINE_WEBHOOK_SECRET!, async (event) => {
    // {id, event_type, created_at, tenant, environment, data}; data.user is the user it is about
    if (event.event_type === 'user.created') { /* event.data.user */ }
}));
```

The handler answers `204`, `401` for bad signatures, and `500` when your callback throws
(so 9in retries). `event.id` is stable across retries; pass `{dedupe: true}` (one process) or
`{dedupe: store}` with a shared `EventStore` (Redis `SET NX EX`, your database) to call your
callback once per event. Retries of a processed event then get `204` without calling it, and
a retry that arrives while the first delivery is still running gets `409`.

## Keep users in your own database (adapter v2)

```ts
import {adapterMiddleware, otpSender, Notifications} from '@9in-io/node';

const sendOtp = otpSender({
    email: new Notifications.NodemailerEmailNotifier(transporter, Notifications.Channel.EMAIL, 'no-reply@acme.com', [{name: 'otp', channel: Notifications.Channel.EMAIL, path: './otp.email.html'}]),
    sms: new Notifications.TwilioSMSNotifier(twilio, '+15550000000', [{name: 'otp', channel: Notifications.Channel.SMS, path: './otp.sms.txt'}]),
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
        await sendOtp(event);   // otp.requested → email / SMS (template data: code, purpose, expires_at, to)
    },
}));
```

Templates fill `{{ data.code }}` placeholders (HTML-escaped; `{{{ … }}}` as is) from the event data
(`code`, `purpose`, `expires_at`, `to`), and `{{ vars.… }}` from the notifier's vars, for example
`Your Acme code is {{ data.code }}.` For loops, conditions or partials, install `handlebars`
(it isn't a dependency of this package) and set `engine: new Notifications.HandlebarsEngine()`,
or pass any engine that has a `render(template, data)` method:

```ts
// npm install handlebars
// {name: 'otp', channel: Notifications.Channel.EMAIL, path: './otp.email.hbs', engine: new Notifications.HandlebarsEngine()}
```

For a ready-made Express router with these pieces, see
[`@9in-io/express-server`](https://github.com/9in-io/express-server). On Workers, Deno, Bun or
Next.js route handlers use `adapterHandler` from `@9in-io/sdk/server` directly.

## Configuration

| Variable | Used for |
|---|---|
| `NINE_ISSUER` | Your tenant, e.g. `https://acme.9in.io` or your custom login domain |
| `NINE_CLIENT_ID`, `NINE_CLIENT_SECRET` | A confidential application (sign-in, introspection, Management API) |
| `NINE_REDIRECT_URI` | The callback URL registered for the application |
| `NINE_AUDIENCE` | Your API's identifier |
| `NINE_ADAPTER_SECRET` | The adapter (Connections → User database) signing secret |
| `NINE_WEBHOOK_SECRET` | The webhook endpoint's signing secret |

`env('ISSUER')` reads one; `configFromEnv()` returns all of them.

Issuers must use `https://`: `ServerAuth`, `requireAuth`, `verifyAccessToken` and
`ManagementClient` throw `insecure_issuer` otherwise (at setup, not per request). Plain http
is accepted for `localhost`, `*.localhost` and loopback addresses; pass
`allowInsecureIssuer: true` for other development hosts.

## Development

```bash
npm install     # links @9in-io/sdk from ../../v2/packages/sdk (see package.json)
npm test        # jest; includes an interop test against ../php (9in/php-sdk) when PHP is installed
npm run build
```

## License

The MIT License (MIT). See [LICENSE](LICENSE). 9in is by [Cubelet Ltd](https://cubelet.co.uk).
