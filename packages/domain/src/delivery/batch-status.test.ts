import { describe, expect, it } from 'vitest';
import { computeBatchStatus, type RecipientStatusCounts } from './batch-status.js';

function counts(overrides: Partial<RecipientStatusCounts>): RecipientStatusCounts {
  return { total: 0, pendingOrInFlight: 0, sent: 0, deadLettered: 0, skipped: 0, ...overrides };
}

describe('computeBatchStatus', () => {
  it('supports partial success', () => {
    expect(computeBatchStatus(counts({ total: 3, sent: 2, deadLettered: 1 }))).toBe('PartialFailure');
  });

  it('is Failed when nobody sent and someone dead-lettered', () => {
    expect(computeBatchStatus(counts({ total: 2, deadLettered: 2 }))).toBe('Failed');
  });

  it('is Completed when skips are the only non-sends', () => {
    expect(computeBatchStatus(counts({ total: 3, sent: 2, skipped: 1 }))).toBe('Completed');
  });

  it('is Running while recipients remain in flight', () => {
    expect(computeBatchStatus(counts({ total: 3, pendingOrInFlight: 1, sent: 2 }))).toBe('Running');
  });
});
