# Delivery engine (Phase 8)

The delivery engine expands an approved campaign version into concrete
recipients, enqueues one BullMQ job per recipient, and processes each job
through simulated provider adapters (email, SMS, Facebook Page).

## Behavior

- **Recipient expansion** — merges selected audiences (deduplicating
  people across overlaps), then expands to Email/Sms contact methods
  with **Granted** consent only, plus one Facebook Page recipient per
  resolved page destination.
- **Idempotency** — batch key = `(campaignId, campaignVersionId)`;
  recipient key = `(channel, person, contactMethod)` or
  `(FacebookPage, destination)`. Re-starting send reuses the batch;
  reprocessing a job never double-sends (claim guard).
- **Retries / DLQ** — transient failures retry with exponential backoff
  up to 5 attempts; permanent failures dead-letter immediately.
- **Partial success** — one recipient failing never blocks others;
  batch status rolls up to `PartialFailure` when some sent and some
  dead-lettered.
- **Audit** — `delivery.batch.started`, `delivery.recipient.sent`,
  `delivery.recipient.dead_lettered`, plus campaign status changes.

## API

- `POST /campaigns/:id/send-now` — starts delivery (same as
  `POST /campaigns/:id/delivery-batches`)
- `GET /campaigns/:id/delivery-batches`
- `GET /campaigns/:id/delivery-batches/:batchId`

Requires `campaigns.send` (start) or `campaigns.send` /
`campaigns.approve` (read).

## Running locally

1. PostgreSQL + Redis via `docker compose up -d`
2. Apply migrations, start API and worker:

```bash
pnpm --filter @ward-comms/database db:migrate
pnpm --filter @ward-comms/api dev
pnpm --filter @ward-comms/worker dev
```

## Simulated failure knobs

| Channel | Trigger | Result |
| --- | --- | --- |
| Email | address contains `simulate-permanent-failure` | permanent |
| Email | address contains `simulate-transient-failure` | transient |
| SMS | number contains `555-0100` | permanent |
| SMS | number contains `555-0199` | transient |
| Facebook | message contains `simulate-permanent-failure` | permanent |
| Facebook | message contains `simulate-transient-failure` | transient |

## Known gaps

- `CampaignSchedule` is stored but not auto-polled; an operator must
  call send-now after `scheduledFor`.
- When a person belongs to multiple overlapping audiences with different
  overrides, the first contributing audience (stable merge order) wins
  for content resolution.
- Provider adapters are simulated only — real SDKs arrive in Phase 9.
