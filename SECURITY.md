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

## Scope

This policy currently covers the repository foundation established in Phase 2 (monorepo tooling, health checks, environment validation). Authentication, ward code handling, audience logic, and provider integrations will extend this policy as they are implemented in later phases.
