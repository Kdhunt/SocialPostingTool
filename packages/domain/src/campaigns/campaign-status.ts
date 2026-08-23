// Campaign lifecycle status transitions.
//
// phases/07-campaigns.md requires "campaign status transitions" and tests
// for "invalid status transitions". This is the single source of truth for
// which transitions are allowed — the application layer must never move a
// campaign directly between two statuses not listed here.

export const CAMPAIGN_STATUSES = [
  'Draft',
  'PendingApproval',
  'Approved',
  'Rejected',
  'Scheduled',
  'Sending',
  'Sent',
  'Cancelled',
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/** Statuses from which no further transition is ever allowed. */
export const CAMPAIGN_TERMINAL_STATUSES: readonly CampaignStatus[] = ['Sent', 'Cancelled'];

const ALLOWED_TRANSITIONS: Record<CampaignStatus, readonly CampaignStatus[]> = {
  Draft: ['PendingApproval', 'Cancelled'],
  PendingApproval: ['Approved', 'Rejected', 'Cancelled'],
  Approved: ['Scheduled', 'Sending', 'Cancelled'],
  Rejected: ['Draft', 'Cancelled'],
  Scheduled: ['Sending', 'Cancelled'],
  Sending: ['Sent', 'Cancelled'],
  Sent: [],
  Cancelled: [],
};

/**
 * Statuses whose content (base message, image, audiences, channel text) may
 * still be edited. A `Rejected` campaign must first transition back to
 * `Draft` (an explicit "revise" action) before it can be edited again —
 * this keeps exactly one unambiguous editable state rather than letting
 * edits happen silently under a `Rejected` label.
 */
export const CAMPAIGN_EDITABLE_STATUSES: readonly CampaignStatus[] = ['Draft'];

export function isValidCampaignStatusTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isCampaignEditable(status: CampaignStatus): boolean {
  return CAMPAIGN_EDITABLE_STATUSES.includes(status);
}

export function isCampaignStatusTerminal(status: CampaignStatus): boolean {
  return CAMPAIGN_TERMINAL_STATUSES.includes(status);
}
