# Master Cursor Prompt

You are the lead software architect and senior full stack engineer for a new application called Ward Communications Hub.

Your job is to create the initial production quality foundation for a secure communications platform used by ward leaders to manage people, households, audience groups, campaigns, and multichannel communications.

Before writing code:

1. Read `AGENTS.md`.
2. Read every file in `.cursor/rules`.
3. Read every file in `prompts/`.
4. Inspect the repository.
5. Produce a phased implementation plan.
6. Identify architectural risks, privacy risks, and ambiguous requirements.
7. Do not write code until the plan is complete.

## Product purpose

The system allows authorized users to:

- Sign in with an individual username and password
- Enter a shared ward code as an additional organizational gate
- Manage ward members
- Manage households and family relationships
- Create configurable audience groups
- Assign people to multiple audience groups
- Associate communication destinations with multiple audience groups
- Create one campaign with one base message and one base image
- Create audience specific versions of the message and image
- Send email
- Send SMS
- Publish image and text to authorized Facebook Pages
- Schedule campaigns
- Review delivery results
- Prevent duplicate sends when audiences overlap
- Maintain an audit trail

## Architecture

Create a pnpm monorepo using Turborepo.

Required applications:

- `apps/web`
- `apps/mobile`
- `apps/api`
- `apps/worker`

Required shared packages:

- `packages/database`
- `packages/domain`
- `packages/api-client`
- `packages/validation`
- `packages/ui`
- `packages/config`
- `packages/testing`

Use:

- Nuxt 4
- Vue 3
- TypeScript
- Ionic Vue
- Capacitor
- NestJS
- PostgreSQL
- Prisma
- Redis
- BullMQ
- Vitest
- Playwright
- Docker Compose

## Required engineering principles

- Use strict TypeScript.
- Use shared types only where they represent stable contracts.
- Keep domain rules out of controllers and UI components.
- Enforce authorization on the server.
- Never trust client supplied ward, user, role, or permission identifiers.
- Never store readable passwords or ward codes.
- Never place secrets in source control.
- Never log access tokens, passwords, ward codes, or unnecessary personal information.
- Every send operation must use an idempotency key.
- Audience overlap must be resolved before deliveries are created.
- Provider failures must be isolated by channel and destination.
- Real member data must never be used in tests.
- AI generated content must never publish without human confirmation.
- Database schema changes require Prisma migrations.
- Every material business rule requires automated tests.
- Every mutation affecting personal data or communications requires an audit event.

## Initial implementation scope

Build only the foundation required for the first development phase:

- Monorepo
- Local development environment
- Shared configuration
- PostgreSQL
- Redis
- Prisma
- NestJS API
- Worker shell
- Nuxt web shell
- Ionic Vue mobile shell
- Health checks
- Structured logging
- Environment validation
- CI configuration
- Linting
- Formatting
- Unit testing
- Basic integration testing
- Initial architecture documentation

Do not implement Facebook, email, SMS, AI image generation, or Church website integration in the first pass.

## Required deliverables

Produce:

1. Repository structure
2. Architecture plan
3. Docker Compose configuration
4. Environment variable template
5. Database package
6. API health endpoint
7. Worker health mechanism
8. Web health page
9. Mobile shell
10. Shared configuration package
11. CI workflow
12. Test setup
13. `README.md`
14. `CONTRIBUTING.md`
15. `SECURITY.md`
16. Architecture decision records
17. A final verification checklist

## Response behavior

Before making changes, show:

- Proposed repository tree
- Major architectural decisions
- Risks
- Implementation sequence
- Test strategy

After implementation, show:

- Files created
- Commands to run
- Test results
- Known gaps
- Recommended next prompt

Do not hide failures. Do not claim tests passed unless they were actually run.
