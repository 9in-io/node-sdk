# CHANGELOG

## 4.0.0 - 2026-11-10

Breaking: 9in's webhooks, adapter events and Management API are snake_case throughout, with
ISO 8601 UTC times. Needs the 9in release of 2026-11-10. See [MIGRATION.md](MIGRATION.md#3x--4x).

* Requires `@9in-io/sdk` 0.2.0 (re-exported types `WebhookEvent`, `AdapterEvent`, `ManagedUser`,
  `ManagedSession`, `NewUser`, `ImportUser` changed with it).
* Webhook events: `event.event` (was `type`), `event.created_at` (was `createdAt`); `data.userId` is
  gone, use `data.user.id`. `requireAuth().verifier` / `webhookHandler(…, {verifier})` read the new shape.
* `otpSender()` reads `event.event`; `OtpRequestedData` and the template data are `user_id` and
  `expires_at` (were `userId`, `expiresAt`). Update OTP templates that print `expiresAt`.
* `ManagementClient`: inputs and results use the API's names (`email_verified`, `phone_number`,
  `password_hash`, `next_cursor`, ISO `created_at`); `findUser('phone_number', …)`.

## 3.1.0 - 2026-11-09

* `ServerAuth.revoke()` throws `NineError` when 9in refuses the revocation (for example `invalid_client`
  with a wrong secret, or a 5xx). It used to ignore the answer, so a failed revocation looked successful.
  Unknown or already revoked tokens still succeed (RFC 7009). Catch the error where logging out must
  not fail.
* Requires `@9in-io/sdk` 0.1.1, which adds `ManagementClient.findUser(type, value)`, `listUserSessions()`,
  `revokeSession()` and `importUsers(users, {onConflict, source})` (re-exported here).

## 3.0.1 - 2026-11-09

First release on npm, as `@9in-io/node`: the npm organisation `9in` belongs to someone else, so the 9in
packages are published under `@9in-io` (the name of 9in's GitHub account). Same code as 3.0.0.

## 3.0.0 - 2026-11-09 (not published to npm)

Rebranded as **9in** (`@9in-io/node`) and rebuilt on `@9in-io/sdk`. See [MIGRATION.md](MIGRATION.md).

* Re-exports `@9in-io/sdk/server`: `verifyAccessToken` (local JWKS verification), `ManagementClient`, `adapterHandler`, `verifyWebhook`, `verifySignature`, `signPayload`, `NineError`.
* Express / Connect / node:http helpers: `requireAuth`, `webhookHandler`, `verifyWebhookMiddleware`, `adapterMiddleware`, `toNodeHandler`, `toRequest`, `sendResponse`, `readRawBody`.
* `requireAuth({mode})`: `local`, `hybrid` (default with clientId/clientSecret) or `introspect` through `createTokenVerifier`; every key-library algorithm, opaque tokens; `.verifier` for `webhookHandler(…, {verifier})`, which evicts on `token.revoked`, `session.revoked` and `user.*`.
* `verifyIdToken` (used by `ServerAuth`): ID tokens signed with any asymmetric algorithm (RS/PS/ES/EdDSA).
* `ServerAuth`: server-side OIDC sign-in with PKCE, ID token verification, refresh rotation, revocation and logout.
* `otpSender()` delivers adapter `otp.requested` codes with the existing notifiers.
* `webhookHandler(…, {dedupe})` calls `onEvent` once per event id (`processEventOnce` from `@9in-io/sdk`).
* Issuers must use https (`allowInsecureIssuer` for development hosts); checked when `ServerAuth` / `requireAuth` are created.
* `env()` / `configFromEnv()`: `NINE_*` with `SSOFY_*` fallbacks.
* Removed: `APIClient`, `OAuth2Client` re-exports, v1 signatures, storages, and the v1 resource-server toolkit (repositories, datasources, filters, transformers, entities; moved to `legacy/v1-toolkit`, not published).
* Notifier provider SDKs are imported as types only, so they are no longer loaded at runtime.
* Node.js 20.19+. Jest tests, including PHP SDK interop.

## 2.4.3 - 2023-09-10

* Fixed the column mapping issue with UserRepository and SocialLinkRepository.
* Twilio Notifier exception handling.
* Added missing Notifier exports.
* Fixes.

## 2.4.2 - 2023-08-28

* Renamed `Storages` namespace to singular form `Storage`. 

## 2.4.1 - 2023-08-27

* Var **set**/**unset** functions added in Notifier.
* Removed generic transformer interface.

## 2.4.0 - 2023-08-27

* Decoupled template engines from notifier. (HandlebarsEngine at the moment).
* Added SocialLinkRepository interface.
* Added default (generic) repositories.
* Added mock repositories.
* Added Helpers.
* Added Filters.
* Added Transformers.
* Wrapped the javascript-sdk storage classes.
* Fixed the issue with SignatureGenerator.
* New Datasource:
  - mongodb
  - mongoose
  - dynamodb
  - pg
  - mysql2
  - sequelize
* New Notifiers:
  - Twilio (SMS)
  - Vonage (SMS)
  - SendGrid (Email)
  - SES (Email)
  - Mailgun (Email)
  - Mandrill (Email)
  - Nodemailer (Email/SMTP)
* New Event Channels:
  - Redis (Pub/Sub).
* More Fixes.

## 2.3.0 - 2023-08-15

* Added EventManager feature under Events namespace.
* Added Notifier feature under Notifications namespace.
* Added Connection type under Datasource namespace.
* Merged Entities namespace into Models namespace.
* Improved types in model and repository interfaces.

## 2.2.0 - 2023-08-06

* Wrapped models under Models namespace.
* Wrapped entity models under Entities namespace.
* Wrapped repository interfaces under Repositories namespace.
* Fixed the user property type in AuthResponseEntity.
* Fixed the return type with UserRepository::createToken().

## 2.1.1 - 2023-07-30

* Switched to javascript-sdk as the OAuth2 client library.

## 2.1.0 - 2023-07-25

* **New:** OAuth2Client and OAuth2Config.
* Deprecated the old SignatureValidator and APIConfig dependency for SignatureVerifier.
* Changed the return types in repositories to promise.

## 2.0.1 - 2023-07-22

* Repository interfaces have been added useful to resource server integrations. 

## 2.0.0 - 2023-06-08

* Renamed the `Client` to `APIClient` and `ClientConfig` to `APIConfig` for readability.
* Fixed the token cache invalidation issue.

## 1.1.8 - 2023-06-01

* Added the missing `username` property in UserEntity

## 1.1.7 - 2023-05-29

* Added the missing UserEntity properties

## 1.1.6 - 2023-03-19

* Switched to the new User Resource endpoint

## 1.1.5 - 2023-02-28

* Compliance with Draft 1.30 signature style
* Entity models directory restructure and fixes

## 1.1.4 - 2023-02-11

* Added UserEntity missing properties

## 1.1.3 - 2023-02-04

* Added OTPOptionEntity missing properties

## 1.1.2 - 2023-01-24

* Added UserEntity missing properties

## 1.1.0 - 2023-01-19

* Added OTPOptionEntity model
* Added the missed "hash" property to UserEntity model
* Excluded __test__ directory from the build output

## 1.0.0 - 2022-12-16

* First Release
