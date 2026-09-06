# Account email (verification and password reset)

Requirement: after unique-per-ward emails were added to `ApplicationUser`,
the product still could not send mail. This slice adds **platform
transactional email** for inbox confirmation and password reset, sharing
adapters and outbox rules with campaign Email/SMS (which already send via
the delivery worker).

## Plan

1. Reuse campaign Email/SMS adapters for consented campaign sends
   (`PROVIDER_MODE` + encrypted ward `ProviderCredential`).
2. Add a separate **system** email adapter for account mail so a new ward
   can receive setup messages before it configures campaign credentials.
3. Persist hashed one-time tokens; enqueue an `OutboundMessage` in the same
   transaction; send via outbox (immediate kick + worker/cron retry).
4. Never email a password. Admin typed password set remains an emergency
   override only.

## Domain behavior

- Tokens: SHA-256 at rest, 24h verification / 1h reset, max 3 issues per
  user+purpose per 15 minutes (`packages/domain/src/auth/account-token-policy.ts`).
- Outbox idempotency key: `account-email:{kind}:{userId}:{tokenId}`.
- Consent is **not** inferred for account mail — the address is the login
  identity the administrator entered. Campaign sends still require
  `ContactConsent = Granted`.
- `ApplicationUser` has no phone field; account flows do not send SMS.
- Email change reuses `normalizeEmail`, rejects another active user in the
  same ward (self excluded), clears `emailVerifiedAt`, and queues a new
  confirmation. The same email in a different ward is allowed.

## Authorization

| Action | Who |
| --- | --- |
| Create user / ward (queues verification) | `users.manage` / `platform.wards.manage` |
| Resend verification / email reset link | `users.manage` (same ward), signed-in self (`POST /auth/verification-email`), or platform for ward admins |
| Change own email / password | Signed-in user (`PATCH /auth/email`, `POST /auth/change-password`) |
| Change another user's email | `users.manage` (same ward only) via `PATCH /users/:id/email` |
| Forgot / verify / reset via token | Public, rate-limited, no account enumeration |

## Validation

Shared Zod schemas in `packages/validation`: `forgotPasswordRequestSchema`,
`verifyEmailRequestSchema`, `resetPasswordWithTokenRequestSchema`,
`changeEmailRequestSchema`, `changePasswordRequestSchema`,
`updateUserEmailRequestSchema`. Emails reuse domain `normalizeEmail`.
Passwords still use domain `validatePasswordStrength`.

Changing an application-user email re-normalizes, enforces unique-per-ward
excluding self, clears `emailVerifiedAt`, and queues a new confirmation.
Audit records `account.email_changed` without the address.

Self-service password change requires the current password, applies the
strength policy, hashes with Argon2id, and revokes every session. Admins
may still set a password as an emergency override; that path never emails
the plaintext password. Signed-in users manage email/password at
`/settings/account`.

## Audit

Actions (no raw tokens, no passwords):

- `account.verification_email_queued`
- `account.password_reset_email_queued`
- `account.email_verified`
- `account.password_reset_completed`
- `account.email_changed` (no address in metadata)
- `account.password_changed` (sessions revoked; no password in metadata)

## Error handling

- Invalid/expired/consumed tokens return a generic invalid-link message.
- Forgot-password always returns the same accepted message.
- Provider failures stay on the outbox row (`Pending` + `nextAttemptAt` or
  `Failed`); one failed send does not block other messages.
- After a successful send the outbox `body` is redacted.

## Tests

Domain token/idempotency tests; config live-credential checks; API
integration for hash-at-rest, verify, reset, rate limit, and
non-enumeration; worker system-email adapter tests.

## Known gaps

- Unconfirmed email does **not** block sign-in (bootstrap and simulated
  mail must still work).
- Production sending requires `SYSTEM_EMAIL_MODE=live` plus provider
  secrets on the host. Campaign live sending still needs per-ward
  credentials and `PROVIDER_MODE=live`.
