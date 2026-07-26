# Directory (Phase 5)

This document covers the ward directory: people, households, family
relationships, contact methods, and consent, implemented in
`apps/api/src/directory`, `packages/domain/src/directory`, and
`packages/validation/src/directory.schema.ts`.

## Data model recap

See `docs/domain-model.md` for the full entity relationship diagram. The
directory-relevant pieces:

- **Person** — a ward member or contact. `dateOfBirth` is optional (many
  records are legitimately incomplete) and access-restricted for minors.
- **Household** — a residence. Never deleted, only archived.
- **HouseholdMembership** — join between Person and Household with a
  `householdRole` (`Head` | `Member`) and `startedAt`/`endedAt`. This is
  **intentionally separate** from family relationship — a household role
  is administrative, not biological/legal.
- **PersonRelationship** — a directed family relationship (e.g. `personId`
  is the `Husband` of `relatedPersonId`). Every relationship the API
  creates is stored as a reciprocal pair (e.g. `Husband`/`Wife`,
  `Parent`/`Child`, `Guardian`/`Dependent`) so both directions stay in
  sync, built by the pure `buildRelationshipPair` domain function.
- **ContactMethod** — an email or phone value, with an independent
  `ContactConsent` row that is only created when a user *explicitly*
  records a consent decision (never inferred, never defaulted to
  `Granted` — see AGENTS.md #8).

## Minor data restriction

`packages/domain/src/directory/minor-access-policy.ts` exports
`canViewRestrictedMinorFields`, a pure function combining `isMinor(dateOfBirth)`
with whether the caller holds the `minors.contact.read` permission. This
single rule is applied everywhere a person's detail is rendered
(`DirectoryService.toPersonDetail`) so `dateOfBirth` and `contactMethods`
are consistently redacted (returned as `null` / `[]`, with an explicit
`restricted: true` flag — never silently omitted, so clients can tell
"no data" from "redacted by policy") for minors when the caller lacks the
permission. Unknown date of birth fails closed (`isMinor` treats it as a
minor), so incomplete records default to the more restrictive outcome.

Directory search summaries (`PersonSummaryDto`) never include date of
birth or contact methods at all, regardless of permission, since a list
view has no legitimate need for them.

## Divorce, remarriage, guardianship, and inactive relationships

`PersonRelationship` rows are never deleted, only archived
(`archivedAt`). Ending a relationship (`DirectoryService.archiveRelationship`)
archives **both** directions of the reciprocal pair
(`RelationshipRepository.archivePairFor`) so a divorce or an ended
guardianship doesn't leave one side of the pair looking active. Because
archived rows are excluded from the "current relationships" list but not
deleted, remarriage (a new `Spouse`/`Husband`/`Wife` pair to a different
person) can be added afterward without any unique-constraint conflict —
the uniqueness constraint is scoped to
`(personId, relatedPersonId, relationshipType)`, not to "one active spouse".

Guardianship uses the `Guardian`/`Dependent` relationship pair — the same
mechanism as marital relationships, just a different type — so a
guardian's dependent shows up correctly on both people's relationship
lists, and a single-parent household is simply a household with one adult
member holding `Parent` relationships to each child and no `Spouse`
relationship at all (there is no assumption anywhere in the schema or
domain layer that every child has two parents or that every adult has a
spouse).

## Consent is never inferred

Creating a contact method never creates a consent row. A consent row is
created (or updated) only by an explicit call to
`DirectoryService.setConsent`, which always requires an explicit
`status` from the caller — there is no code path that defaults a new
contact method, an audience membership, or any other action to
`Granted` (AGENTS.md #8). `isConsentedToSend` in `packages/domain` treats
every status other than `Granted` (including the absence of a consent
row) as "do not send".

## Authorization

Every directory route requires `SessionAuthGuard` (authenticated) plus
`PermissionsGuard` with one of:

- `directory.read` — search, view people and households.
- `directory.write` — create/edit/archive people, households, contact
  methods, consent, relationships, and household memberships.
- `minors.contact.read` — see a minor's date of birth and contact
  methods (checked inside `DirectoryService`, not just at the route
  level, so it can't be bypassed by calling a nested action directly).

## Known gaps for a production rollout

- Household membership is added by household ID (typed/pasted by the
  user) in this phase's UI rather than a household search-and-pick
  widget — acceptable for an MVP but worth upgrading before wide
  release.
- There is no household member removal UI for household-initiated
  removal (managed from the person's page in this phase); a
  household-initiated "remove member" action would be a small addition
  to `DirectoryController`/`DirectoryService` if the desktop workflow
  needs it.
- Directory search is a simple case-insensitive substring match on
  name fields; a larger ward may eventually want full-text search.
