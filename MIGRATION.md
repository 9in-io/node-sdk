# Migrating

## 4.x → 5.x

The old SSOfy environment variables are no longer read. If you still set any, rename them:
`SSOFY_URL` / `SSOFY_ISSUER` → `NINE_ISSUER`, `SSOFY_CLIENT_ID` / `SSOFY_CLIENT_SECRET` →
`NINE_CLIENT_ID` / `NINE_CLIENT_SECRET`, `SSOFY_REDIRECT_URI` → `NINE_REDIRECT_URI`,
`SSOFY_ADAPTER_SECRET` / `SSOFY_API_SECRET` → `NINE_ADAPTER_SECRET`, `SSOFY_WEBHOOK_SECRET` →
`NINE_WEBHOOK_SECRET`, and any other `SSOFY_<NAME>` → `NINE_<NAME>`. The `LEGACY_ENV` export is
gone; `envSource()` only reports `NINE_*` names. 5.0 requires `@9in-io/sdk` ^0.4.0, whose
`verifier.handleEvent()` and `clear()` are async: `await` them if you call them yourself
(`webhookHandler` does). Nothing else changes.

## 4.0 → 4.1

`handlebars` is no longer installed with `@9in-io/node`.

- If your templates use `engine: new Notifications.HandlebarsEngine()`, add `handlebars` to your
  app: `npm install handlebars`. Nothing else changes.
- Templates that only print values don't need Handlebars: without an engine, `{{ data.code }}`,
  `{{ data.expires_at }}` and `{{ vars.app }}` are filled (HTML-escaped; `{{{ … }}}` as is). Such
  templates used to render the view data as JSON.

## 3.x → 4.x

4.0 follows 9in's move to one wire format: snake_case keys everywhere, the same names going in
and coming out, and ISO 8601 UTC strings for times. Upgrade together with the 9in release of
2026-11-10; 3.x cannot read the new webhooks.

| 3.x | 4.x |
|---|---|
| `event.type` | `event.event_type` |
| `event.createdAt` | `event.created_at` |
| `event.data.userId` | `event.data.user.id` (for `user.deleted`, the user as it was before the deletion) |
| `token.revoked`: `data.type`, `data.clientId` | `data.token_type`, `data.client_id` |
| `user.login`: `data.client` | `data.client_id` |
| Adapter event `type`, `createdAt` | `event_type`, `created_at` |
| `otp.requested` `data.userId`, `data.expiresAt` (and OTP template variables) | `data.user_id`, `data.expires_at` |
| `createUser({emailVerified, phone, phoneVerified, passwordHash})` | `createUser({email_verified, phone_number, phone_number_verified, password_hash})` (the old names are refused) |
| `importUsers([{createdAt: 1680343200000}])` (ms) | `importUsers([{created_at: '2023-04-01T10:00:00Z'}])` |
| User `createdAt`, `updatedAt`, `lastLoginAt` (ms), `loginCount` | `created_at`, `updated_at`, `last_login_at` (ISO strings), `login_count` |
| `listUsers()` → `nextCursor` | `next_cursor` |
| `getUser()` → `hasPassword`, `mfa.since`, `mfa.recoveryCodesLeft` | `has_password`, `mfa.enabled_at`, `mfa.recovery_codes_left` |
| Session `userId`, `authTime`, `userAgent`, `createdAt`, `lastSeenAt`, `expiresAt`, `revokedAt` | `user_id`, `auth_time`, `user_agent`, `created_at`, `last_seen_at`, `expires_at` (ISO strings); no `revoked_at` |
| `findUser('phone', …)` | `findUser('phone_number', …)` |
| `createLoginLink()` → `expires_at` (Unix seconds) | `expires_at` (ISO string) |

Method options (`returnTo`, `ttlSeconds`, `onConflict`) and the `ServerAuth` token set keep their
names: they are this library's API, not 9in's wire format.
