import { describe, expect, it } from 'vitest';
import { MAX_DELIVERY_ATTEMPTS, classifyDeliveryErrorCode, decideRetry } from './retry-policy.js';

describe('decideRetry', () => {
  it('dead-letters permanent failures immediately', () => {
    expect(decideRetry({ attemptNumber: 1, failureKind: 'permanent' })).toEqual({
      shouldRetry: false,
      isDeadLetter: true,
      delayMs: null,
    });
  });

  it('retries transient failures under the budget', () => {
    const decision = decideRetry({ attemptNumber: 1, failureKind: 'transient' });
    expect(decision.shouldRetry).toBe(true);
    expect(decision.delayMs).toBeGreaterThan(0);
  });

  it('dead-letters after exhausting the attempt budget', () => {
    expect(decideRetry({ attemptNumber: MAX_DELIVERY_ATTEMPTS, failureKind: 'transient' }).isDeadLetter).toBe(
      true,
    );
  });
});

describe('classifyDeliveryErrorCode', () => {
  it.each(['invalid_recipient', 'credentials_expired', 'unauthorized'])('classifies %s as permanent', (code) => {
    expect(classifyDeliveryErrorCode(code)).toBe('permanent');
  });

  it.each(['rate_limited', 'timeout', 'provider_unavailable'])('classifies %s as transient', (code) => {
    expect(classifyDeliveryErrorCode(code)).toBe('transient');
  });
});
