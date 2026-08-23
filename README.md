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
  web-e2e/    Playwright end-to-end tests for the web app
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

4. Generate the Prisma client, apply migrations, and seed local data:

   ```bash
   pnpm --filter @ward-comms/database db:generate
   pnpm --filter @ward-comms/database db:migrate
   pnpm --filter @ward-comms/database db:seed
   pnpm db:seed:dev
   ```

   `db:seed` loads the Role/Permission catalog. `db:seed:dev` creates a
   fictional dev ward, ward admin (`admin` / `ChangeMeNow!23`), and ward
   code (`WARD-DEV-CODE`) — credentials are printed to the console.

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
- Web sign-in: `http://localhost:3000/login` (after `db:seed:dev`, use `admin` / `ChangeMeNow!23`, ward code `WARD-DEV-CODE`)

### One-command bootstrap (after `pnpm install` and `.env` setup)

```bash
docker compose up -d
pnpm --filter @ward-comms/database db:generate
pnpm --filter @ward-comms/database db:migrate
pnpm --filter @ward-comms/database db:seed
pnpm db:seed:dev
pnpm dev
```

### Creating a user to sign in with

Use `pnpm db:seed:dev` after migrations and the role catalog seed — it prints
fictional dev credentials to the console. For custom users, use the
**Admin → Users** screen (`/admin/users`) or the `POST /users` API.

### Provisioning additional wards

Platform operators with the `platform.wards.manage` permission can create new
ward tenants from **Admin → Wards** (`/admin/wards`) or `POST /platform/wards`.
Each provisioned ward receives:

- A ward record (name and time zone)
- An initial **WardAdmin** account
- Version 1 of the shared ward code (stored as a hash only)

The dev seed assigns `PlatformAdmin` to the local `admin` user. In production,
assign the `PlatformAdmin` role only to trusted operators (re-run
`pnpm --filter @ward-comms/database db:seed` after upgrading to pick up the
new permission, then assign the role via the database or user management).

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
- `PUT /audiences/:id/rules`, `GET /audiences/:id/rules/preview`, `POST /audiences/:id/rules/apply` (rule-based membership; manual adds are kept on apply)
- `POST /audiences/:id/destinations`, `DELETE /audiences/:id/destinations/:destinationId`
- `POST /audiences/preview` → `{ audienceGroupIds: string[] }`, returns deduplicated membership across the given audiences
- `GET /communication-destinations?includeArchived=`, `POST /communication-destinations`, `POST /communication-destinations/:id/archive`

No audience or destination name is ever hardcoded in business logic — a
ward names its own audience groups through the "Create audience" screen.

### Campaigns overview

Once signed in, visit `http://localhost:3000/campaigns` (web). Key
endpoints (all require an authenticated session plus `campaigns.create` /
`campaigns.approve` / `campaigns.send`, see `docs/campaigns.md`):

- `GET /campaigns?query=&status=&includeArchived=`, `GET /campaigns/:id`
- `POST /campaigns`, `PATCH /campaigns/:id` (rename), `POST /campaigns/:id/archive`
- `PATCH /campaigns/:id/content` (base message/image; only while `Draft`), `POST /campaigns/:id/assets`
- `POST /campaigns/:id/assets/generate`, `POST .../assets/:assetId/confirm`, `POST .../assets/:assetId/reject` (AI image drafts require explicit confirm before use)
- `PATCH /campaigns/:id/overlap-resolution` — choose how overlapping audience content is resolved
- `POST /campaigns/:id/audiences`, `PATCH .../audiences/:audienceGroupId`, `DELETE .../audiences/:audienceGroupId`
- `POST /campaigns/:id/channel-text`, `DELETE /campaigns/:id/channel-text/:channel`
- `GET /campaigns/:id/preview` — deduplicated recipient count, overlap conflicts with winning audience, and per-audience/per-channel resolved text
- `GET /campaigns/:id/validation` — the same readiness check `submit` enforces
- `POST /campaigns/:id/submit`, `POST /campaigns/:id/approve`, `POST /campaigns/:id/reject`, `POST /campaigns/:id/revise`
- `POST /campaigns/:id/schedule`, `POST /campaigns/:id/send-now` (starts the Phase 8 delivery engine), `POST /campaigns/:id/cancel`
- `GET|POST /campaigns/:id/delivery-batches`, `GET /campaigns/:id/delivery-batches/:batchId`

### Delivery overview (Phase 8)

`POST /campaigns/:id/send-now` expands recipients (overlap + consent),
creates an idempotent `DeliveryBatch`, and enqueues one BullMQ job per
pending recipient. The worker (`pnpm --filter @ward-comms/worker dev`)
processes jobs through **simulated** Email/SMS/Facebook adapters with
retries and dead-letter handling. See `docs/delivery.md`. Redis must be
running (`docker compose up -d`).

### Providers overview (Phase 9)

Provider credentials are stored encrypted (`POST /provider-credentials`).
Set `PROVIDER_MODE=credentialed` to require them before simulated sends, or
`PROVIDER_MODE=live` for real SendGrid/SMTP, Twilio, and Facebook Graph
calls. See `docs/providers.md`. Manage credentials at
`/admin/provider-credentials`. Facebook Page publishing only — Groups
are not supported.

### Admin overview (post-phase)

- `/admin/users` — list/create users, assign roles, enable/disable
- `/admin/ward-code` — view active version, rotate ward code
- `/admin/provider-credentials` — upsert/revoke encrypted provider secrets
- `/admin/audit` — audit log viewer (`GET /audit`)

### AI image generation

Optional env: `OPENAI_API_KEY`, `AI_IMAGE_MODE=simulated|live`. When the key
is absent or mode is `simulated`, generated images use deterministic placeholder
URLs. Confirmed assets are required before attaching to campaign content
(AGENTS.md #13). Ward **ContactConsent** is separate from
[Church Account subscription preferences](https://account.churchofjesuschrist.org/subscriptions).

### Mobile app

The Ionic shell (`apps/mobile`) includes audiences list/detail, campaigns
list/detail, and approve/reject/revise/send-now actions when permissions allow.

## Deploying on Vercel

See **[docs/vercel.md](docs/vercel.md)** for the full setup. One Vercel project,
one domain — Nuxt UI and NestJS API on the same host via root `vercel.json`
rewrites.

Quick summary:

1. **One project** — root directory = repository root (`.`)
2. Link **Vercel Postgres** + **Upstash Redis** in the dashboard
3. Set auth secrets + `CRON_SECRET` once
4. Deploy — **migrations and role seed run in the build**
5. Verify `https://your-domain/health`, create your first ward in the UI

Do **not** set `NUXT_PUBLIC_API_BASE_URL` unless you split web and API domains.

## Common scripts

Run from the repository root; Turborepo fans these out across the workspace:

```bash
pnpm build       # Build all apps and packages
pnpm dev         # Run all apps in watch/dev mode
pnpm lint        # Lint all apps and packages
pnpm typecheck   # Type-check all apps and packages
pnpm test        # Run unit and integration tests
pnpm test:e2e    # Run Playwright smoke tests (starts Nuxt; no API/DB required for current suite)
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
