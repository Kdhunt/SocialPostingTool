import { describe, expect, it } from 'vitest';
import {
  computeBatchIdempotencyKey,
  computeRecipientIdempotencyKey,
  computeSkippedRecipientIdempotencyKey,
} from './idempotency.js';

describe('computeBatchIdempotencyKey', () => {
  it('is deterministic for the same campaign + version', () => {
    expect(computeBatchIdempotencyKey('c1', 'v1')).toBe(computeBatchIdempotencyKey('c1', 'v1'));
  });

  it('differs across campaigns and versions', () => {
    const base = computeBatchIdempotencyKey('c1', 'v1');
    expect(computeBatchIdempotencyKey('c2', 'v1')).not.toBe(base);
    expect(computeBatchIdempotencyKey('c1', 'v2')).not.toBe(base);
  });
});

describe('computeRecipientIdempotencyKey', () => {
  it('collapses overlapping audiences to one key', () => {
    const a = computeRecipientIdempotencyKey({ channel: 'Email', personId: 'p1', contactMethodId: 'cm1' });
    const b = computeRecipientIdempotencyKey({ channel: 'Email', personId: 'p1', contactMethodId: 'cm1' });
    expect(a).toBe(b);
  });

  it('differs across channels and people', () => {
    const email = computeRecipientIdempotencyKey({ channel: 'Email', personId: 'p1', contactMethodId: 'cm1' });
    const sms = computeRecipientIdempotencyKey({ channel: 'Sms', personId: 'p1', contactMethodId: 'cm2' });
    const other = computeRecipientIdempotencyKey({ channel: 'Email', personId: 'p2', contactMethodId: 'cm3' });
    expect(email).not.toBe(sms);
    expect(email).not.toBe(other);
  });

  it('scopes FacebookPage to destination', () => {
    const a = computeRecipientIdempotencyKey({ channel: 'FacebookPage', destinationId: 'd1' });
    const b = computeRecipientIdempotencyKey({ channel: 'FacebookPage', destinationId: 'd2' });
    expect(a).not.toBe(b);
  });
});

describe('computeSkippedRecipientIdempotencyKey', () => {
  it('never collides with a real recipient key', () => {
    const skip = computeSkippedRecipientIdempotencyKey({ channel: 'Email', personId: 'p1' });
    const sent = computeRecipientIdempotencyKey({ channel: 'Email', personId: 'p1', contactMethodId: 'cm1' });
    expect(skip).not.toBe(sent);
  });
});
