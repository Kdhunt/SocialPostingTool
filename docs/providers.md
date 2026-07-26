# Provider integrations (Phase 9)

Provider SDKs stay out of `packages/domain`. Adapters live in
`apps/worker/src/providers` and implement the domain interfaces from
`packages/domain/src/delivery/provider-adapter.ts`.

## Modes

| `PROVIDER_MODE` | Behavior |
| --- | --- |
| `simulated` (default) | Phase 8 magic-value adapters; no credentials required |
| `credentialed` | Requires an encrypted `ProviderCredential` matching the destination's `providerAccountReference`, then simulates the send (or a future SDK call) |

## Credential storage

- Table: `provider_credential` — AES-256-GCM ciphertext only
- Key: `PROVIDER_CREDENTIALS_ENCRYPTION_KEY` (env; never in source control)
- API: `GET|POST /provider-credentials`, `POST /provider-credentials/:id/revoke`
- Responses never include plaintext secrets

### Example credential JSON shapes

Email:

```json
{ "apiKey": "...", "fromAddress": "noreply@example.test" }
```

SMS:

```json
{ "accountSid": "...", "authToken": "...", "fromNumber": "+15555550100" }
```

Facebook Page (Page publishing only — Groups are not supported):

```json
{ "pageAccessToken": "...", "pageId": "..." }
```

Wire a destination with the same `providerAccountReference` string used
when upserting the credential.

## Failure handling

Adapters normalize failures to domain error codes consumed by
`classifyDeliveryErrorCode`:

- Permanent: `invalid_recipient`, `invalid_destination`, `content_rejected`, `unauthorized`, `unsubscribed`, `credentials_expired`
- Transient: `rate_limited`, `timeout`, `provider_unavailable`, …

Duplicate prevention remains the delivery engine's responsibility
(idempotency keys + claim guard) — adapters return a `providerMessageId`
on success for audit/storage on `DeliveryAttempt`.

## Production next steps

1. Replace the inner simulated send in each credentialed adapter with the
   real SDK (SendGrid/SES, Twilio, Facebook Graph) behind the same
   interface.
2. Prefer a managed secret store (AWS Secrets Manager / Vault) and store
   only references in `provider_credential` if policy requires it.
3. Rotate `PROVIDER_CREDENTIALS_ENCRYPTION_KEY` via `encryptionKeyId`.

## Permissions

Managing credentials requires `campaigns.send` (same boundary as sending).
