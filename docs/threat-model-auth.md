# Threat Model — Authentication and Ward Code (Phase 4)

This document describes the threat model for the login flow implemented in
`apps/api/src/auth`, following the required rules in AGENTS.md and
`.cursor/rules/security.mdc`.

## Assets

- User passwords (never stored — only Argon2id hashes)
- The shared ward code (never stored — only a peppered Argon2id hash)
- Session and refresh tokens (never stored raw — only SHA-256 hashes)
- Directory data reachable once authenticated (religious affiliation,
  household relationships, contact info, age/minor data — see AGENTS.md
  "Product boundaries")
- Audit log integrity (must reflect what actually happened)

## Actors

- Legitimate ward member/leader signing in from a known or new device
- An attacker with no credentials, attempting to guess or brute-force
  credentials or the ward code
- An attacker who has obtained one factor (e.g. a leaked password from
  another breach, or a leaked ward code from a bulletin) but not the other
- An attacker with transient network access (e.g. shared Wi-Fi) able to
  observe or tamper with traffic
- An attacker who has obtained a database backup/leak
- A disgruntled former user/leader whose account should have been disabled

## Threats and mitigations

| # | Threat | Mitigation | Where |
| - | --- | --- | --- |
| 1 | Credential stuffing / brute-force password guessing | Per-account lockout with exponential backoff after `LOCKOUT_THRESHOLD` (5) failed attempts, persisted in the database so it survives process restarts and applies across API instances; additional best-effort per-IP+username in-process rate limiting on `/auth/login` and `/auth/ward-code` | `packages/domain/src/auth/lockout-policy.ts`, `apps/api/src/auth/login-rate-limiter.service.ts` |
| 2 | Ward code brute-force (shared secret, potentially short/memorable) | Ward code is hashed with Argon2id **combined with a server-side pepper** (`WARD_CODE_PEPPER`, never in source control), stored in a *separate* table from passwords; the same lockout/rate-limit protections apply to the `/auth/ward-code` endpoint | `apps/api/src/auth/ward-code-hasher.service.ts`, `.env.example` |
| 3 | Database leak exposing password hashes | Argon2id (memory-hard, GPU-resistant) hashing; hashes are never returned by any API response (`AuthUser` never includes `passwordHash`) | `apps/api/src/auth/password-hasher.service.ts`, `packages/validation/src/auth.schema.ts` |
| 4 | Database leak exposing session/refresh tokens | Only SHA-256 *hashes* of opaque, high-entropy (256-bit) tokens are stored; the raw token is returned to the client exactly once and never persisted server-side | `apps/api/src/common/session-token.util.ts` |
| 5 | Session hijacking via XSS reading the session token | Web session token is delivered only as an **HTTP-only** cookie (`Secure` in production, `SameSite=Lax`) — never reachable from JavaScript, never placed in localStorage/sessionStorage | `apps/api/src/auth/auth.controller.ts` (`setSessionCookie`), AGENTS.md |
| 6 | Session replay after logout | Logout revokes the session row (`revokedAt`); every authenticated request re-validates `revokedAt IS NULL` and `expiresAt` server-side | `packages/domain/src/auth/session-policy.ts`, `apps/api/src/auth/guards/session-auth.guard.ts` |
| 7 | Stolen mobile refresh token used indefinitely | Refresh tokens rotate on every use (`AuthService.refresh`); the previous refresh token hash is immediately invalidated, limiting the reuse window to a single request; access tokens are short-lived (15 min) and stateless, bounding the blast radius of a leaked access token | `apps/api/src/auth/auth.service.ts` |
| 8 | Cross-site request forgery (CSRF) against cookie-authenticated endpoints | `SameSite=Lax` cookie attribute blocks the cookie from being sent on cross-site POST navigations from third-party sites; CORS is restricted to an explicit allow-list (`CORS_ALLOWED_ORIGINS`), not `*`, with `credentials: true` only for those origins | `apps/api/src/main.ts` |
| 9 | Username enumeration via differing error messages/timing | Unknown username and wrong password both return the same generic `InvalidCredentialsError` (401) and are audited identically; no "no such user" message is ever returned | `apps/api/src/auth/auth.service.ts` |
| 10 | JWT "alg: none" / algorithm-confusion class of attacks on stateless tokens | The mobile access token and "ward code required" login ticket use a fixed HMAC-SHA256 scheme with no algorithm field to manipulate — not a general JWT library | `apps/api/src/common/signed-token.util.ts` |
| 11 | Ward code and password not required together on every device | The ward code is required again whenever a device has not verified the *currently active* ward code version — covering both "new device" and "after rotation" — enforced as a pure, testable domain rule | `packages/domain/src/auth/ward-code-policy.ts` |
| 12 | A disabled account continuing to act via an existing session | Disabling an account immediately revokes all of that user's active sessions in the same operation, and every subsequent request re-checks `disabledAt IS NULL` | `apps/api/src/auth/auth.service.ts` (`disableAccount`) |
| 13 | Silent/undetectable account takeover attempts | Every login attempt (success, failure, lockout, disabled-account block), ward code attempt, refresh, logout, session revocation, and account disable/enable is recorded as an `AuditEvent` — but never with the attempted password or ward code value | `apps/api/src/audit/audit.service.ts`, calls throughout `auth.service.ts` |
| 14 | Frontend-only authorization checks being trusted | Every protected route is guarded server-side by `SessionAuthGuard` (authentication) and, where relevant, `PermissionsGuard` + `@RequirePermission(...)` (authorization) — the client never supplies its own permission claims | `apps/api/src/auth/guards/*`, `apps/api/src/auth/decorators/require-permission.decorator.ts` |
| 15 | Leaking the pepper/secrets via source control | `WARD_CODE_PEPPER`, `SESSION_SECRET`, `REFRESH_TOKEN_SECRET` are read from environment variables only, validated at startup by `@ward-comms/config`, and `.env` is gitignored; only `.env.example` (placeholders) is committed | `packages/config`, `.gitignore` |

## Known limitations / accepted risk (documented, not hidden)

- **Username lookup is not ward-scoped.** `ApplicationUser` is only unique
  per `(wardId, username)`, but the current login form collects only a
  username. `UserRepository.findActiveByUsername` therefore does a
  best-effort *global* lookup. In a deployment with multiple wards sharing
  one instance and overlapping usernames, this is ambiguous. A production
  rollout with multiple wards should add a ward-scoping field (e.g. a ward
  slug) to the login form.
- **The per-IP+username rate limiter is in-process, not distributed.** It
  resets on process restart and is not shared across horizontally scaled
  API instances. The durable, cross-instance defense is the persisted
  per-account lockout (`failedLoginAttempts` / `lockedUntil`), which is
  authoritative. A production deployment should still add a Redis-backed
  limiter (Redis is already part of this stack for BullMQ) for defense in
  depth.
- **Mobile refresh tokens are held only in memory in this phase's mobile
  shell**, not in platform secure storage, so signing out on app restart
  is expected until a secure-storage Capacitor plugin is integrated. See
  `apps/mobile/src/auth-store.ts` for the explicit code comment tracking
  this.
- **No breached-password-list check** (e.g. HaveIBeenPwned k-anonymity
  API) — only a small common-password blocklist. Consider adding this for
  production.
- **No email-based account recovery flow** is implemented yet — administrators
  disable/enable accounts directly; a self-service password reset flow is
  out of scope for Phase 4.
