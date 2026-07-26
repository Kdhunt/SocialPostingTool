export interface RecipientStatusCounts {
  total: number;
  pendingOrInFlight: number;
  sent: number;
  deadLettered: number;
  skipped: number;
}

export type BatchRollupStatus = 'Pending' | 'Running' | 'Completed' | 'PartialFailure' | 'Failed';

export function computeBatchStatus(counts: RecipientStatusCounts): BatchRollupStatus {
  if (counts.total === 0) return 'Completed';
  if (counts.pendingOrInFlight > 0) {
    const anyTerminal = counts.sent > 0 || counts.deadLettered > 0 || counts.skipped > 0;
    return anyTerminal ? 'Running' : 'Pending';
  }
  if (counts.deadLettered > 0 && counts.sent === 0) return 'Failed';
  if (counts.deadLettered > 0) return 'PartialFailure';
  return 'Completed';
}
