# Contributing to Ward Communications Hub

Thank you for contributing. This document covers local setup, conventions, and the workflow expected for every change.

## Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer (`corepack enable` or `npm install -g pnpm`)
- Docker (for PostgreSQL and Redis via Docker Compose)

## Getting started

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm dev
```

See `README.md` for full local development instructions.

## Repository conventions

These conventions come from `AGENTS.md` and the rules in `.cursor/rules/`. They are binding for every change:

- Use pnpm for all package management.
- Use strict TypeScript. Avoid `any`.
- Use PascalCase for classes and types, camelCase for variables and functions, kebab-case for route segments.
- Use singular database table names.
- Provide explicit return types on exported functions.
- Keep controllers thin; keep domain logic framework independent in `packages/domain`.
- Use dependency injection for provider adapters (email, SMS, Facebook, storage, queues, AI).
- Store all timestamps in UTC; display them in the configured ward time zone.
- Never commit secrets, provider credentials, or real member data.

## Branching and commits

- Do not commit directly to `main`.
- Create a feature branch per unit of work, for example `feat/phase-3-domain-model`.
- Keep changes scoped to the task at hand; do not combine unrelated refactors with feature work.
- Include migration notes in the pull request description when the database schema changes.
- Include rollback notes when infrastructure configuration changes.

## Required pattern for every feature

Every feature change should document, in the pull request description or an accompanying doc:

1. Requirement reference
2. Plan
3. Domain behavior
4. Authorization behavior
5. Validation
6. Audit behavior
7. Tests
8. Error handling
9. Documentation updates

## Before opening a pull request

Run, and ensure all pass locally:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same commands and will block merges on failure.

## Testing expectations

- Use Vitest for unit tests, NestJS testing utilities for API/worker tests, and Playwright for web end-to-end tests.
- Use only generated fictional data. Never use real member data in tests.
- Tests must not depend on execution order.
- Every material business rule requires automated tests.

## Security expectations

See `SECURITY.md` and `.cursor/rules/security.mdc`. In particular: never log secrets, never store passwords or ward codes in readable form, and never place provider secrets in source control.
