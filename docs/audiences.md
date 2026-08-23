# Audience groups (Phase 6)

This document covers configurable audience groups and communication
destinations, implemented in `apps/api/src/audiences`,
`packages/domain/src/audiences`, and
`packages/validation/src/audience.schema.ts`.

## No hardcoded organization names

Nothing in `AudiencesService`, the domain helpers, the Zod schemas, or the
UI hardcodes "Young Women", "Young Men", "Relief Society", "Priesthood",
"Youth", "Adults", "General", or any other organization name.
`CreateAudienceGroupRequest.name` is a free-text field chosen by the ward
through the UI — the seed script (`packages/database/prisma/seed.ts`)
intentionally does not create any audience groups either, since Phase 3
already scoped that file to role/permission catalog data only and
audience/person data should never ship as fixture data alongside a real
deployment (AGENTS.md #5). If a ward wants example groups, they create
them once through the "Create audience" screen.

## Data model recap

See `docs/domain-model.md` for the full entity relationship diagram.

- **AudienceGroup** — a ward-scoped, ward-named collection.
  `archivedAt` supports a reversible soft-delete; a genuinely unused group
  (no members, no destinations) can also be hard-deleted.
- **AudienceGroupMember** — many-to-many join between `AudienceGroup` and
  `Person`. Unlike relationships/contact methods, membership rows are
  hard-deleted on removal — the `AuditEvent` trail is what preserves the
  historical fact that someone was added or removed, not the join row
  itself.
- **CommunicationDestination** — a ward-scoped "where to send" record
  (email list, SMS number, Facebook Page) identified by `channel` and a
  non-secret `providerAccountReference`. Provider credentials are added in
  Phase 9 via a managed secret store, never stored on this row.
- **AudienceDestination** — many-to-many join between `AudienceGroup` and
  `CommunicationDestination`.

## Safe delete

`packages/domain/src/audiences/safe-delete.ts` (`checkAudienceSafeToDelete`)
permanently deletes an `AudienceGroup` only when it has zero members and
zero destination links. Any other group must be archived instead of
deleted — archiving is always reversible (`restore`), while delete is not.
`AudiencesService.delete` calls this rule before touching the database and
returns a specific, actionable error message (e.g. "remove all members or
archive it instead") rather than a generic failure.

## Duplicate membership detection and overlap

`packages/domain/src/audiences/overlap.ts` provides:

- `isDuplicateMembership` — checked by `AudiencesService.addMember` before
  insert, so adding a person who is already a member returns a clear 409
  Conflict instead of surfacing a raw database constraint error. The
  database's `@@unique([audienceGroupId, personId])` constraint remains
  the final backstop.
- `mergeAudienceMemberships` / `findOverlappingPeople` — used by
  `AudiencesService.preview` (`POST /audiences/preview`) to combine the
  membership of several audiences into one deduplicated list, with every
  contributing audience id attached to each person. This directly serves
  AGENTS.md #7 ("never silently send duplicate messages to overlapping
  audiences") — later phases (campaigns/delivery) can call this same
  preview to compute a true recipient count and avoid double-sending to
  someone in two selected audiences.

## Manual membership today, rule-based membership later

Phase 6 only implements **manual** membership — a person is a member
because someone explicitly added them. `packages/domain/src/audiences/membership-mode.ts`
defines `AudienceMembershipMode` (`'Manual'` is the only implemented value
today) and a placeholder `AudienceMembershipRule` shape so a future phase
can add rule-based membership (e.g. "everyone under 18") without
introducing a new concept into every call site at that point. No rules
engine, and no new database columns for rules, are implemented yet — per
phases/06-audiences.md, this phase only prepares the extension point.

## Authorization

Every audience route requires `SessionAuthGuard` (authenticated) plus
`PermissionsGuard` with one of:

- `audiences.read` — search, view audience groups, members, destinations,
  and preview.
- `audiences.manage` — create/rename/archive/restore/delete audience
  groups, and manage membership and destination links.
- `destinations.manage` — create and archive `CommunicationDestination`
  records (linking an existing destination to an audience only requires
  `audiences.manage`, since it does not create provider-facing
  configuration).

## Known gaps for a production rollout

- Adding a member currently requires knowing the person's id (surfaced via
  the directory search page) rather than an inline person search-and-pick
  widget in the audience screen — acceptable for an MVP, worth upgrading
  later.
- `CommunicationDestination.configuration` (a `Json?` column already in
  the schema) is unused until Phase 9 adds provider-specific,
  non-secret configuration (e.g. a Facebook Page id).
- There is no mobile UI for audience management in this phase — per
  `.cursor/rules/ui.mdc` ("keep complex administration desktop first"),
  audience/destination administration is desktop-only; mobile prioritizes
  directory member lookup and (from Phase 7 onward) campaign creation,
  preview, and approval.
