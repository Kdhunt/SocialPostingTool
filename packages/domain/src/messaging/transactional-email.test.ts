import { describe, expect, it } from 'vitest';
import { computeOutboundIdempotencyKey } from './transactional-email.js';

describe('computeOutboundIdempotencyKey', () => {
  it('is stable for the same kind, user, and token', () => {
    const a = computeOutboundIdempotencyKey({
      kind: 'EmailVerification',
      userId: 'user-1',
      tokenId: 'token-1',
    });
    const b = computeOutboundIdempotencyKey({
      kind: 'EmailVerification',
      userId: 'user-1',
      tokenId: 'token-1',
    });
    expect(a).toBe(b);
    expect(a).toBe('account-email:EmailVerification:user-1:token-1');
  });

  it('changes when the token or kind changes so a resend is a new send', () => {
    const first = computeOutboundIdempotencyKey({
      kind: 'EmailVerification',
      userId: 'user-1',
      tokenId: 'token-1',
    });
    const resent = computeOutboundIdempotencyKey({
      kind: 'EmailVerification',
      userId: 'user-1',
      tokenId: 'token-2',
    });
    const reset = computeOutboundIdempotencyKey({
      kind: 'PasswordReset',
      userId: 'user-1',
      tokenId: 'token-1',
    });
    expect(first).not.toBe(resent);
    expect(first).not.toBe(reset);
  });
});
