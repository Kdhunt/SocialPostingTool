# ADR 0001: Monorepo Foundation with pnpm and Turborepo

## Status

Accepted

## Context

Ward Communications Hub requires four applications (API, worker, web, mobile) and multiple shared packages (database, domain, api-client, validation, ui, config, testing) that must share types, validation schemas, and configuration while keeping clear boundaries between framework code, domain rules, and provider integrations, per `AGENTS.md` and `.cursor/rules/architecture.mdc`.

Key requirements driving this decision:

- A single domain package must be importable by both the API/worker (server) and, indirectly through the API, the web/mobile clients, without leaking a database or provider dependency into the client apps.
- Changes to shared validation schemas or the API client must be easy to build and consume across apps without publishing to a private registry.
- CI must be able to install once and run lint/typecheck/test/build efficiently across the whole workspace.

## Decision

Use a pnpm workspace with Turborepo as the task runner:

- pnpm workspaces (`pnpm-workspace.yaml`) manage installation and linking of `apps/*` and `packages/*` as workspace packages (`@ward-comms/*`).
- Turborepo (`turbo.json`) orchestrates `build`, `dev`, `lint`, `typecheck`, and `test` tasks across the workspace with dependency-aware caching, so packages build before the apps that depend on them.
- Each package and app has its own `package.json`, `tsconfig.json` (extending `tsconfig.base.json`), and test setup, but shares root-level ESLint, Prettier, and TypeScript base configuration for consistency.
- `packages/domain` is framework independent (no NestJS, no Vue, no Prisma import) so it can be unit tested in isolation and reused by both `apps/api` and `apps/worker`.
- `packages/database` is the only package that imports Prisma; it exports a typed client for `apps/api` and `apps/worker` to consume. `apps/web` and `apps/mobile` never import it directly.

## Consequences

- Positive: one install, one lockfile, consistent tooling versions, fast incremental CI via Turborepo caching, and enforced dependency direction between domain/database and the apps.
- Positive: shared packages can be iterated on without a publish step; Turborepo rebuilds dependents automatically.
- Negative: monorepo tooling (pnpm + Turborepo) has a learning curve and the root configuration (ESLint flat config, base tsconfig) must be kept consistent as new packages are added.
- Negative: a misconfigured workspace dependency (e.g., a UI component importing Prisma) is only caught by review and lint rules, not by a hard runtime boundary; this is mitigated by code review and the architecture rules in `AGENTS.md`.

## Alternatives considered

- **Separate repositories per app**: rejected because it would duplicate validation schemas and domain rules, increasing the risk of drift between the web/mobile clients and the API.
- **Nx instead of Turborepo**: viable, but Turborepo has a lower configuration surface for this project's size and integrates well with pnpm workspaces without additional plugins.
- **Yarn or npm workspaces instead of pnpm**: rejected; pnpm's strict, content-addressable `node_modules` layout catches accidental undeclared dependencies earlier, which matters for enforcing the architecture boundaries above.
