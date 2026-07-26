# Security Policy

Ward Communications Hub handles sensitive information, including religious affiliation, household relationships, contact information, age information, information about minors, communication consent, and social publishing credentials. Security and privacy are core product requirements, not an afterthought.

## Reporting a vulnerability

If you discover a security vulnerability, report it privately to the project maintainers rather than opening a public issue. Include:

- A description of the vulnerability and its potential impact
- Steps to reproduce
- Any relevant logs (with secrets redacted)

Do not include real member data, credentials, or ward codes in a vulnerability report.

## Security principles enforced in this repository

- Passwords and ward codes are hashed using Argon2id (or an equivalently strong algorithm) and are never stored or logged in readable form. Ward codes are hashed separately from user passwords.
- Browser sessions use secure, HTTP-only cookies. Mobile clients use short-lived access tokens with secure refresh handling.
- Authentication endpoints are rate limited. Failed login attempts are recorded without storing attempted passwords.
- Provider secrets (email, SMS, Facebook, storage, queues, AI) are never committed to source control. In production they are stored in a managed secret store; locally they live only in an untracked `.env` file derived from `.env.example`.
- Sensitive values are encrypted at rest where appropriate.
- Every protected route enforces server-side role and permission checks. Client-supplied authorization claims are never trusted.
- Access to date of birth and minor contact information is minimized and restricted to authorized roles.
- Exports and bulk access to member data are audited.
- Logs are redacted of personal data, secrets, and full authentication payloads.
- Email addresses and phone numbers are validated and normalized before use.
- Contact data is never sent to AI providers unless explicitly required and approved.
- The design includes data retention and deletion hooks.

## Dependency and infrastructure security

- Keep dependencies up to date and review `pnpm audit` output regularly.
- Database schema changes are made only through Prisma migrations, never by hand-editing the database.
- Docker Compose services (PostgreSQL, Redis) are for local development only; production configuration uses managed, access-controlled infrastructure.

## Authentication (Phase 4)

- Passwords are hashed with Argon2id via `@node-rs/argon2` (prebuilt native binding, no plaintext password ever persisted or logged).
- The ward code is hashed **separately** from passwords, combined with a server-side pepper (`WARD_CODE_PEPPER`) before hashing, and stored in its own `ward_code_version` table so it can be rotated without touching user records.
- The ward code must be re-verified on a device's first sign-in and again after every ward code rotation — enforced by a pure, unit-tested domain rule (`packages/domain/src/auth/ward-code-policy.ts`), not left to client behavior.
- Web sessions use an HTTP-only, `SameSite=Lax` cookie (`Secure` in production); the raw session token is never placed in localStorage/sessionStorage and never readable by JavaScript.
- Mobile clients use a short-lived (15 minute) stateless access token plus a longer-lived, rotating refresh token; refresh tokens rotate on every use so a stolen token has a bounded reuse window.
- Only SHA-256 hashes of session/refresh tokens are stored server-side (`user_session` table); the raw values exist only transiently in the response that issues them.
- Failed login attempts increment a persisted counter and trigger an exponential-backoff lockout after 5 consecutive failures; the attempted password itself is never recorded. A best-effort in-process rate limiter provides additional protection on the login and ward-code endpoints (see `docs/threat-model-auth.md` for the distributed-rate-limiting gap this leaves).
- Every login attempt (success, failure, lockout, disabled-account block), ward code attempt, token refresh, logout, session revocation, and account enable/disable is written to the append-only `audit_event` table — never including the attempted password or ward code value.
- Administrators can disable an account (`users.manage` permission, enforced server-side); disabling immediately revokes all of that account's active sessions.
- See `docs/threat-model-auth.md` for the full threat model, mitigations, and explicitly documented known limitations.

## Scope

This policy covers the repository foundation (Phase 2), authentication (Phase 4), directory/audiences/campaigns (Phases 5–7), the delivery engine (Phase 8), and provider credential encryption (Phase 9). See `docs/providers.md` for how Email/SMS/Facebook Page credentials are encrypted at rest and never returned by the API.
