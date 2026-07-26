# Ward Communications Hub

Ward Communications Hub is a secure communications platform used by ward leaders to manage people, households, audience groups, campaigns, and multichannel communications (email, SMS, Facebook).

This repository is a pnpm + Turborepo monorepo. See `docs/architecture.md` for the full architecture and `AGENTS.md` / `.cursor/rules/` for binding conventions and security requirements.

## Repository layout

```
apps/
  api/        NestJS HTTP API (GET /health)
  worker/     Background job processor (BullMQ + Redis)
  web/        Nuxt 4 / Vue 3 web application
  mobile/     Ionic Vue + Capacitor mobile shell
packages/
  database/   Prisma schema, generated client, migrations
  domain/     Framework independent business rules
  api-client/ Typed client consumed by web and mobile
  validation/ Shared validation schemas (Zod)
  ui/         Shared Vue components
  config/     Environment validation and shared application configuration
  testing/    Test factories and utilities
```

## Prerequisites

- [Node.js](https://nodejs.org/) 20 or newer
- [pnpm](https://pnpm.io/) 9 or newer — enable via `corepack enable` or `npm install -g pnpm`
- [Docker](https://www.docker.com/) (for local PostgreSQL and Redis)

## Local development setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment template and fill in local values (do not commit `.env`):

   ```bash
   cp .env.example .env
   ```

3. Start PostgreSQL and Redis:

   ```bash
   docker compose up -d
   ```

4. Generate the Prisma client and apply migrations:

   ```bash
   pnpm --filter @ward-comms/database db:generate
   pnpm --filter @ward-comms/database db:migrate
   ```

5. Run every app in development mode:

   ```bash
   pnpm dev
   ```

   Or run a single app, for example the API only:

   ```bash
   pnpm --filter @ward-comms/api dev
   ```

Once running:

- API health check: `http://localhost:3001/health`
- Web health page: `http://localhost:3000`
- Web sign-in: `http://localhost:3000/login`

### Creating a user to sign in with

Phase 4 ships the authentication system but no user-management UI yet.
Create a ward, a ward code, and a user directly against the database to try
the login flow locally:

```bash
pnpm --filter @ward-comms/database db:seed   # seeds Role/Permission catalog only
```

Then use `pnpm --filter @ward-comms/database exec prisma studio` (or a short
script using `@node-rs/argon2` to hash a password/ward code) to create a
`Ward`, an `ApplicationUser` with an Argon2id `passwordHash`, and a
`WardCodeVersion` with a peppered Argon2id `codeHash`. See
`docs/threat-model-auth.md` and `apps/api/src/auth/auth.service.integration.spec.ts`
for exact hashing calls.

### Authentication overview

- `POST /auth/login` → `{ username, password, clientType?: 'web'|'mobile' }`
- `POST /auth/ward-code` → `{ loginTicket, wardCode, clientType? }` (only when `/auth/login` responds `ward_code_required`)
- `POST /auth/refresh` → `{ refreshToken }` (mobile only)
- `POST /auth/logout`, `GET /auth/session`, `GET /auth/sessions`, `POST /auth/sessions/:id/revoke`
- `POST /auth/users/:id/disable` / `.../enable` (requires the `users.manage` permission)

See `docs/threat-model-auth.md` for the full threat model and known limitations.

### Directory overview

Once signed in, visit `http://localhost:3000/directory` (web) or the
"Search directory" link on the mobile home screen. Key endpoints (all
require an authenticated session plus `directory.read` / `directory.write`,
see `docs/directory.md`):

- `GET /directory/people?query=&includeInactive=&householdId=&limit=`, `GET /directory/people/:id`
- `POST /directory/people`, `PATCH /directory/people/:id`, `POST /directory/people/:id/archive` / `.../restore`
- `POST /directory/people/:id/contact-methods`, `PATCH .../contact-methods/:id`, `DELETE .../contact-methods/:id`
- `PATCH /directory/people/:id/contact-methods/:contactMethodId/consent` (the only way consent changes — never inferred)
- `POST /directory/people/:id/relationships`, `DELETE .../relationships/:relationshipId`
- `POST /directory/people/:id/household-memberships`, `DELETE .../household-memberships/:membershipId`
- `GET /directory/households`, `GET /directory/households/:id`, `POST /directory/households`, `PATCH /directory/households/:id`, `POST /directory/households/:id/archive`

Date of birth and contact methods are withheld for minors unless the
caller holds the `minors.contact.read` permission (see
`docs/directory.md`).

### Audiences overview

Once signed in, visit `http://localhost:3000/audiences` (web). Key
endpoints (all require an authenticated session plus `audiences.read` /
`audiences.manage` / `destinations.manage`, see `docs/audiences.md`):

- `GET /audiences?query=&includeArchived=`, `GET /audiences/:id`
- `POST /audiences`, `PATCH /audiences/:id` (rename/edit description)
- `POST /audiences/:id/archive` / `.../restore`, `DELETE /audiences/:id` (only succeeds when the audience has no members and no destinations)
- `POST /audiences/:id/members`, `DELETE /audiences/:id/members/:personId`
- `POST /audiences/:id/destinations`, `DELETE /audiences/:id/destinations/:destinationId`
- `POST /audiences/preview` → `{ audienceGroupIds: string[] }`, returns deduplicated membership across the given audiences
- `GET /communication-destinations?includeArchived=`, `POST /communication-destinations`, `POST /communication-destinations/:id/archive`

No audience or destination name is ever hardcoded in business logic — a
ward names its own audience groups through the "Create audience" screen.

## Common scripts

Run from the repository root; Turborepo fans these out across the workspace:

```bash
pnpm build       # Build all apps and packages
pnpm dev         # Run all apps in watch/dev mode
pnpm lint        # Lint all apps and packages
pnpm typecheck   # Type-check all apps and packages
pnpm test        # Run unit and integration tests
pnpm format      # Format the repository with Prettier
```

## Contributing

See `CONTRIBUTING.md` for conventions, branching, and the checklist to run before opening a pull request. See `SECURITY.md` for the security and privacy commitments this project follows.

## Cursor starter prompts

The prompts below were used to bootstrap this repository with Cursor Agent and remain useful as a reference for future phases.

Use these prompts in order.

1. Open an empty repository in Cursor.
2. Add this entire package to the repository root.
3. Open `01-master-build-prompt.md`.
4. Paste that prompt into Cursor Agent mode.
5. Ask Cursor to create a plan before making changes.
6. Review the plan.
7. Run each phase prompt in `phases/` one at a time.
8. Do not let Cursor jump ahead into provider integrations before the foundation, data model, authentication, and audience logic are stable.

Recommended Cursor instruction:

> Read all files in `prompts/`, `AGENTS.md`, and `.cursor/rules` before making changes. Treat them as binding project requirements.

## Initial stack

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
- pnpm workspaces
- Turborepo
- Vitest
- Playwright
- Docker Compose

## Working rule

Every implementation request must result in:

1. A written plan
2. The affected requirements
3. The files to be changed
4. The implementation
5. Tests
6. A summary of risks and unresolved items

Do not accept broad repository rewrites without a clear reason.
