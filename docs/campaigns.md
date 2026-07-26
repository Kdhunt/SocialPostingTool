# Campaigns (Phase 7)

This document covers campaign drafting, implemented in
`apps/api/src/campaigns`, `packages/domain/src/campaigns`, and
`packages/validation/src/campaign.schema.ts`. Per phases/07-campaigns.md,
this phase is drafting and review only — **no route in this phase ever
calls a real email/SMS/Facebook provider**.

## Data model recap

See `docs/domain-model.md` for the full entity relationship diagram.

- **Campaign** — a ward-scoped campaign with a mutable `name` and a
  `status` (see "Status transitions" below). `archivedAt` is a reversible
  soft-delete.
- **CampaignVersion** — an immutable-once-approved snapshot of content:
  `versionNumber`, one base message, and one base image
  (`baseImageAssetId`). A campaign always has exactly one *current*
  version; `revise` (see below) creates a new version rather than mutating
  the version an approval decision was recorded against.
- **CampaignChannelVersion** — per-channel (`Email` / `Sms` /
  `FacebookPage`) text override for a version. Falls back to the version's
  base message when absent.
- **CampaignAudience** — one selected `AudienceGroup` for a version, with
  an optional audience-specific text override and image override.
- **CampaignAsset** — a registered image (`storageReference`,
  `contentType`, `altText`) that a version's base image or an audience's
  image override can point to. No file upload/storage integration exists
  yet — `storageReference` is treated as an opaque, already-uploaded
  reference (a Phase 9-era concern).
- **CampaignDestination** — the ward's `CommunicationDestination` rows
  reachable from the version's *currently selected* audiences, recomputed
  automatically every time an audience is added or removed. This is what
  submission validation and (simulated) sending act on, not the audiences
  themselves.
- **CampaignApproval** — an append-only decision log (`Approved` /
  `Rejected`, optional comment, approver, timestamp). Never edited or
  deleted, so the history of who approved what and when is preserved even
  after a campaign is revised or archived.
- **CampaignSchedule** — an append-only record of a requested send time;
  cancelling a schedule sets `cancelledAt` rather than deleting the row.

## One base message/image, with two independent kinds of overrides

`packages/domain/src/campaigns/content-resolution.ts` implements the
precedence used everywhere content is resolved (draft editing, preview,
and simulated sending):

1. An **audience-specific override** (`CampaignAudience.overrideText` /
   `overrideImageAssetId`) always wins for that audience, if set.
2. Otherwise, a **channel-specific override** (`CampaignChannelVersion.text`)
   wins for that channel, if set.
3. Otherwise, the version's **base message** / **base image** is used.

Audience overrides and channel overrides are independent axes — a
campaign can have an SMS-specific shortened message *and* a
women's-audience-specific message at the same time; `resolveEffectiveText`
takes both into account for a given (audience, channel) pair
(`CampaignsService.preview`).

## Draft persistence, preview, and validation

- **Draft persistence** — every mutating drafting endpoint
  (`PATCH /campaigns/:id/content`, `POST /campaigns/:id/audiences`,
  `POST /campaigns/:id/channel-text`, etc.) is only allowed while the
  campaign is `Draft` (`isCampaignEditable` from
  `packages/domain/src/campaigns/campaign-status.ts`); a `Rejected`
  campaign must be explicitly revised back into `Draft` first (see below).
- **Preview** (`GET /campaigns/:id/preview`) resolves per-audience,
  per-channel text/length/limit and — reusing the Phase 6 overlap helpers
  (`mergeAudienceMemberships`, `findOverlappingPeople`) — a deduplicated
  total unique recipient count plus an overlap count across the selected
  audiences, so a shared member of two selected audiences is never
  double-counted or (later) double-sent to.
- **Validation** (`GET /campaigns/:id/validation`,
  `packages/domain/src/campaigns/campaign-submission-validation.ts`) is
  the single source of truth for "is this campaign ready to submit for
  approval": it requires actual content (a base message, or every
  selected audience having its own override text), at least one selected
  audience, at least one *active* resolved destination, and zero archived
  destinations left over from before an audience was removed.
  `CampaignsService.submitForApproval` runs this same check server-side
  and rejects the transition with a 400 if it fails — the `GET` endpoint
  exists purely so the UI can show the same errors before the user tries.

## Status transitions

`packages/domain/src/campaigns/campaign-status.ts` is the single source of
truth for legal transitions:

```
Draft → PendingApproval, Cancelled
PendingApproval → Approved, Rejected, Cancelled
Approved → Scheduled, Sending, Cancelled
Rejected → Draft, Cancelled
Scheduled → Sending, Cancelled
Sending → Sent, Cancelled
Sent, Cancelled → (terminal — no further transitions)
```

`CampaignsService` never moves a campaign between two statuses not listed
above (`isValidCampaignStatusTransition`) and records a `campaign.status_changed`
`AuditEvent` (with the `from`/`to` status) on every transition, in addition
to a dedicated audit action for the domain-specific event that caused it
(e.g. `campaign.sent_simulated`).

`revise` is the explicit `Rejected → Draft` action: it creates a **new**
`CampaignVersion` (copying the previous version's base message/image as a
starting point) rather than mutating the rejected version, so the content
an approver rejected remains exactly as it was when they saw it.

## Provider simulator — no real sends in this phase

`apps/api/src/campaigns/provider-simulator/campaign-provider-simulator.service.ts`
is the only thing `CampaignsService.sendNow` calls to "send" a message. It
never makes an HTTP call or touches a real Email/SMS/Facebook SDK — it
just returns a fabricated `providerMessageId` and a `simulated_sent`
status synchronously, so the full Draft → submit → approve → send flow can
be exercised locally and in tests today. Phase 8 replaces this with a
real, queued, retried, idempotent, per-recipient delivery engine, and
Phase 9 adds the real per-channel provider adapters behind it (see
AGENTS.md #10: "never hardcode provider specific behavior into campaign
domain logic" — the simulator/adapter boundary is exactly what keeps that
true).

Because sending happens once per resolved *destination* rather than once
per audience or per recipient (a destination can be reached by more than
one selected audience), the simulator only sees the version's base
message plus a channel override — not an audience override. Per-audience,
per-recipient content resolution (which does use the audience override)
is what `preview` shows and what the Phase 8 delivery engine will
actually act on.

## Authorization

Every campaign route requires `SessionAuthGuard` (authenticated) plus
`PermissionsGuard` with one of:

- `campaigns.create` — search, view, draft, edit, submit, revise,
  archive, and cancel campaigns.
- `campaigns.approve` — approve/reject a `PendingApproval` campaign, and
  view campaigns (so an approver who never drafts anything can still see
  what needs a decision).
- `campaigns.send` — schedule or send-now an `Approved`/`Scheduled`
  campaign.

Read routes (`GET /campaigns`, `GET /campaigns/:id`, preview, validation)
accept **either** `campaigns.create` or `campaigns.approve`, since both
roles need to see the same content.

## Tests

- `packages/domain/src/campaigns/campaign-status.test.ts` — every legal
  and illegal transition, plus terminal-state checks.
- `packages/domain/src/campaigns/campaign-submission-validation.test.ts` —
  missing content, empty audiences, and archived destinations.
- `packages/domain/src/campaigns/content-resolution.test.ts` — override
  precedence and channel length limits.
- `apps/api/src/campaigns/campaigns.service.integration.spec.ts` (live
  PostgreSQL, skipped automatically without one) — drafting end to end,
  rejecting submission for missing content/empty audiences/archived
  destinations, deduplicated overlap in `preview`, version independence
  across a reject → revise cycle, invalid transitions, and the full
  Draft → submit → approve → send-now happy path.

## Known gaps for a production rollout

- There is no file upload endpoint — `CampaignAsset.storageReference` is
  entered as free text in this phase, pointing at wherever an image was
  already uploaded out of band.
- `CampaignDestination` is recomputed from the *currently* selected
  audiences on every add/remove, but if a destination is archived after
  that recomputation without touching the campaign's audiences, submission
  validation (not the stored `CampaignDestination` rows themselves) is
  what catches it — this is intentional (destination history should not
  silently disappear from an already-drafted campaign, see AGENTS.md #12),
  but it means the drafting UI should always re-run validation before
  submitting.
- There is no mobile UI for campaigns in this phase — per
  `.cursor/rules/ui.mdc`, campaign creation/preview/approval is a stated
  mobile priority, but is implemented desktop-first here; mobile
  screens are a good candidate for a follow-up phase.
- `sendNow` synchronously "sends" every resolved destination in a single
  request with no retry, no idempotency key, and no partial-failure
  isolation between destinations — Phase 8 (delivery engine) is where all
  of that is added, per AGENTS.md #6/#9.
