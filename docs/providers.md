# Provider integrations (Phase 9 + post-phase)

Provider SDKs stay out of `packages/domain`. Adapters live in
`apps/worker/src/providers` and implement the domain interfaces from
`packages/domain/src/delivery/provider-adapter.ts`.

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

Facebook Page (Graph API feed publish via fetch; Groups are not supported):

```json
{ "pageAccessToken": "...", "pageId": "..." }
```

Wire a destination with the same `providerAccountReference` string used
when upserting the credential.

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

Duplicate prevention remains the delivery engine's responsibility
(idempotency keys + claim guard) — adapters return a `providerMessageId`
on success for audit/storage on `DeliveryAttempt`.

## Permissions

Managing credentials requires `campaigns.send` (same boundary as sending).
