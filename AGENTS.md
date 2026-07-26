# AGENTS.md

These rules apply to every coding agent working in this repository.

## Product boundaries

This application handles:

- Religious affiliation
- Household relationships
- Contact information
- Age information
- Information about minors
- Communication consent
- Social publishing credentials

Treat privacy and authorization as core product behavior.

## Mandatory rules

1. Never store passwords or ward codes in readable form.
2. Never log secrets or full authentication payloads.
3. Never place provider secrets in source control.
4. Never trust frontend authorization.
5. Never use production member data in tests.
6. Never create a delivery without an idempotency key.
7. Never silently send duplicate messages to overlapping audiences.
8. Never infer consent from audience membership.
9. Never let one failed destination block all other destinations.
10. Never hardcode provider specific behavior into campaign domain logic.
11. Never change the database schema without a migration.
12. Never delete historical delivery records when a destination is removed.
13. Never publish generated content without explicit user confirmation.
14. Never expose minor contact information to unauthorized roles.
15. Never redesign the data model during an unrelated task.

## Required implementation pattern

Every feature must include:

- Requirement reference
- Plan
- Domain behavior
- Authorization behavior
- Validation
- Audit behavior
- Tests
- Error handling
- Documentation updates

## Repository conventions

- Use pnpm.
- Use strict TypeScript.
- Use singular database table names.
- Use PascalCase for classes and types.
- Use camelCase for variables and functions.
- Use kebab case for route segments.
- Use explicit return types for exported functions.
- Avoid `any`.
- Avoid inline styles.
- Avoid `!important`.
- Prefer composition over inheritance.
- Keep controllers thin.
- Keep domain logic framework independent where practical.
- Use dependency injection for provider adapters.
- Use UTC for stored timestamps.
- Display timestamps using the configured ward time zone.

## Git behavior

- Do not commit directly to the main branch.
- Keep changes scoped.
- Do not combine unrelated refactors with feature work.
- Include migration notes when schema changes occur.
- Include rollback notes for infrastructure changes.
