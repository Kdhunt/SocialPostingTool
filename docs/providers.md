# Provider integrations (Phase 9 + post-phase)

Provider SDKs stay out of `packages/domain`. Adapters live in
`apps/worker/src/providers` and implement the domain interfaces from
`packages/domain/src/delivery/provider-adapter.ts`.

## System (account) email

Account verification and password-reset mail use **platform** env vars
(`SYSTEM_EMAIL_MODE`, `SYSTEM_EMAIL_PROVIDER`, `SYSTEM_EMAIL_FROM`, plus
Resend, SendGrid, or SMTP secrets). They do **not** use ward `ProviderCredential`
rows, so a new ward can receive setup mail before campaign credentials
exist. `SYSTEM_EMAIL_MODE=simulated` (default) records a successful send
without calling a provider. See `docs/account-email.md`.

Campaign Email/SMS still use the modes below.

## Modes

| `PROVIDER_MODE` | Behavior |
| --- | --- |
| `simulated` (default) | Magic-value adapters; no credentials required |
| `credentialed` | Requires an encrypted `ProviderCredential`, then simulates the send |
| `live` | Requires encrypted credentials, then calls real provider APIs |

## Credential storage

- Table: `provider_credential` — AES-256-GCM ciphertext only
- Key: `PROVIDER_CREDENTIALS_ENCRYPTION_KEY` (env; never in source control)
- API: `GET|POST /provider-credentials`, `POST /provider-credentials/:id/revoke`
- Web UI: `/admin/provider-credentials`
- Responses never include plaintext secrets

### Example credential JSON shapes

Email (Resend):

```json
{ "provider": "resend", "apiKey": "re_...", "fromAddress": "noreply@example.test" }
```

Email (SendGrid):

```json
{ "provider": "sendgrid", "apiKey": "...", "fromAddress": "noreply@example.test" }
```

Email (SMTP — uses nodemailer in the worker):

```json
{ "provider": "smtp", "host": "...", "port": 587, "user": "...", "pass": "...", "fromAddress": "..." }
```

Legacy SendGrid shape (no `provider` field) is also accepted:

```json
{ "apiKey": "...", "fromAddress": "noreply@example.test" }
```

SMS (Twilio REST via fetch):

```json
{ "accountSid": "...", "authToken": "...", "fromNumber": "+15555550100" }
```

Facebook Page (Graph API feed publish via fetch; Groups are not supported).
Each ward connects **its own** Page. Credentials are keyed by
`wardId + FacebookPage + pageId`, so Ward A cannot publish with Ward B’s
token.

```json
{ "pageAccessToken": "...", "pageId": "..." }
```

Ward admins with `campaigns.send` can connect a Page at
**Administration → Facebook Page** (OAuth when `FACEBOOK_APP_ID` /
`FACEBOOK_APP_SECRET` are set, or a Page access token). Connecting creates
an encrypted `ProviderCredential` and a Facebook Page destination for
**that ward only**. Campaign Facebook channel text is posted to
`/{pageId}/feed`.

Wire a destination with the same `providerAccountReference` string used
when upserting the credential (`pageId`).

## Outbound communication footers

Email and SMS adapters append a standard footer linking members to manage
**Church Account** communication preferences at:

https://account.churchofjesuschrist.org/subscriptions

This is separate from ward-local `ContactConsent` recorded in this app.
We never scrape or call that URL, never infer Church Account subscription
status into `ContactConsent`, and never use it as an unsubscribe
mechanism for ward-local sends — it is informational only.

## Failure handling

Adapters normalize failures to domain error codes consumed by
`classifyDeliveryErrorCode`:

- Permanent: `invalid_recipient`, `invalid_destination`, `content_rejected`, `unauthorized`, `unsubscribed`, `credentials_expired`
- Transient: `rate_limited`, `timeout`, `provider_unavailable`, …

Missing or expired credentials return `credentials_expired` or
`unauthorized` permanent errors.

Live adapters never throw. Every live call (SendGrid, Resend, SMTP, Twilio,
Facebook Graph) has a 10-second limit (`LIVE_PROVIDER_TIMEOUT_MS` in
`apps/worker/src/providers/live-provider-call.ts`):

- no answer in time → `timeout` (retried);
- refused, reset or DNS failure → `provider_unavailable` (retried);
- SMTP: a rejected login → `unauthorized`; a 5xx recipient rejection →
  `invalid_recipient`; a 4xx recipient rejection (for example greylisting)
  → `provider_unavailable`, so it is retried rather than dead-lettered.

Error messages for network failures are generic (provider name and a
system code such as `ECONNREFUSED`), so request URLs and keys never reach
delivery records. As a second guard, the delivery engine and the account
email sender treat any thrown error as `provider_unavailable`.

### Testing live mode locally

`apps/worker/src/providers/live-providers.test.ts` runs each live adapter
against fakes: a recording `fetch` for the HTTP APIs and a real SMTP server
on 127.0.0.1 (`apps/worker/src/providers/testing/`). It checks the request
each provider receives, the member footer, every status mapping, network
failures and timeouts. `apps/worker/src/delivery/live-delivery.integration.test.ts`
runs a delivery in `PROVIDER_MODE=live` from a stored, encrypted SMTP
credential to the fake inbox, against the test database. Nothing in these
tests contacts a real provider.

Duplicate prevention remains the delivery engine's responsibility
(idempotency keys + claim guard) — adapters return a `providerMessageId`
on success for audit/storage on `DeliveryAttempt`.

## Permissions

Managing credentials requires `campaigns.send` (same boundary as sending).
