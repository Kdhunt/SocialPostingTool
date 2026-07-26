# Architecture

## Overview

Ward Communications Hub is a pnpm + Turborepo monorepo. It is a secure communications platform used by ward leaders to manage people, households, audience groups, campaigns, and multichannel communications (email, SMS, Facebook).

This document describes the repository-level architecture established in Phase 2 (Repository Foundation). Domain entities, authentication, audience logic, campaigns, and provider integrations are introduced in later phases (see `phases/`).

## Repository layout

```
apps/
  api/        NestJS HTTP API
  worker/     Background job processor (BullMQ + Redis)
  web/        Nuxt 4 / Vue 3 web application
  mobile/     Ionic Vue + Capacitor mobile shell
packages/
  database/   Prisma schema, generated client, migrations
  domain/     Framework independent business rules
  api-client/ Typed client for apps/api, consumed by web and mobile
  validation/ Shared validation schemas (Zod)
  ui/         Shared Vue components
  config/     Environment validation and shared application configuration
  testing/    Test factories and utilities
```

## Dependency direction

- `packages/domain` has no dependency on any framework, provider SDK, or app. It expresses business rules as plain TypeScript.
- `packages/database` depends on nothing else in the workspace. It owns the Prisma schema and generated client.
- `apps/api` and `apps/worker` depend on `packages/domain`, `packages/database`, `packages/config`, and `packages/validation`. They must not contain business rules in controllers or job handlers; controllers and handlers stay thin and delegate to domain services.
- `apps/web` and `apps/mobile` depend on `packages/api-client`, `packages/validation`, `packages/ui`, and `packages/config`. They must not import `packages/database` or Prisma directly, and must not duplicate domain rules.
- `packages/api-client` depends on `packages/validation` for shared request/response types, and is consumed only by `apps/web` and `apps/mobile`.
- `packages/ui` depends only on Vue and shared validation types; it must not import Prisma or domain logic.
- `packages/testing` depends on `packages/domain` and `packages/validation` to build fictional test fixtures; it is a dev-only dependency for other packages and apps.

Provider integrations (email, SMS, Facebook, storage, queues, AI) are implemented as adapters injected into domain services. Provider SDKs are never imported directly into `packages/domain`.

## Cross-cutting concerns

- **Configuration**: All environment variables are validated at startup using Zod schemas in `packages/config`. Apps fail fast on invalid or missing configuration rather than running with unsafe defaults.
- **Logging**: Structured JSON logging is used in `apps/api` and `apps/worker`. Logs never include secrets, passwords, ward codes, access tokens, or unnecessary personal information.
- **Health checks**: Each backend app exposes a mechanism to verify it is running and can reach its critical dependencies (`apps/api` exposes `GET /health`; `apps/worker` exposes an equivalent health mechanism and verifies its Redis connection).
- **Timestamps**: All persisted timestamps are stored in UTC. Display formatting uses the configured ward time zone (`WARD_TIME_ZONE`).
- **Idempotency**: Send/delivery operations will use idempotency keys once campaigns are implemented (Phase 7/8). This is a required design constraint even though no delivery logic exists yet in Phase 2.

## Dependency injection in apps/api

`apps/api` runs under `tsx` (esbuild) for `dev`/`start` and is type-checked/emitted with `tsc` for `build`. esbuild does not emit the `design:paramtypes` metadata that NestJS's implicit constructor-type dependency injection relies on (`emitDecoratorMetadata`). To keep behavior identical between `tsx` and a real `tsc` build, every constructor-injected dependency in `apps/api` must use an explicit `@Inject(Token)` decorator rather than relying on implicit type reflection. See `apps/api/src/health/health.controller.ts` for the pattern.

## Local development environment

- **PostgreSQL 16** and **Redis 7** run via `docker-compose.yml` for local development.
- **Prisma** manages the PostgreSQL schema and migrations from `packages/database`.
- **BullMQ** (backed by Redis) is the queue mechanism for `apps/worker`.

## Testing strategy

- **Vitest** for unit tests across packages and apps.
- **NestJS testing utilities** for API and worker integration tests.
- **Playwright** for web end-to-end tests (added when web flows exist beyond the health page).
- **Testcontainers or isolated Docker services** for database integration tests where practical.
- Tests use only generated fictional data and must not depend on execution order.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs install, lint, typecheck, test, and build on every push and pull request against `main`, using ephemeral PostgreSQL and Redis service containers.

## Architecture decision records

See `docs/adr/` for individual decisions and their rationale, starting with `docs/adr/0001-monorepo-foundation.md`.
