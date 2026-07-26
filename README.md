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
