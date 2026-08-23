// Idempotency key derivation for the delivery engine.
// AGENTS.md #6/#7 — starting a send and expanding recipients must be safe to repeat.

export function computeBatchIdempotencyKey(campaignId: string, campaignVersionId: string): string {
  return `batch:${campaignId}:${campaignVersionId}`;
}

export interface PersonRecipientKeyInput {
  channel: 'Email' | 'Sms';
  personId: string;
  contactMethodId: string;
}

export interface DestinationRecipientKeyInput {
  channel: 'FacebookPage';
  destinationId: string;
}

/**
 * Unique within one batch. Person channels are scoped to (channel, person,
 * contact method) — not audience — so overlapping audiences collapse to one
 * message. FacebookPage is scoped to the destination.
 */
export function computeRecipientIdempotencyKey(
  input: PersonRecipientKeyInput | DestinationRecipientKeyInput,
): string {
  if (input.channel === 'FacebookPage') {
    return `recipient:FacebookPage:destination:${input.destinationId}`;
  }
  return `recipient:${input.channel}:person:${input.personId}:contact:${input.contactMethodId}`;
}

/** Skipped rows (no consent / no contact method) — scoped to channel+person only. */
export function computeSkippedRecipientIdempotencyKey(input: {
  channel: PersonRecipientKeyInput['channel'];
  personId: string;
}): string {
  return `skip:${input.channel}:person:${input.personId}`;
}
