import { describe, expect, it } from 'vitest';
import { InvalidSignedTokenError, signToken, verifyToken } from './signed-token.util.js';

const secret = 'a'.repeat(32);

describe('signToken / verifyToken', () => {
  it('round-trips a payload', () => {
    const token = signToken({ userId: 'user-1' }, secret, 60_000);
    const verified = verifyToken<{ userId: string }>(token, secret);
    expect(verified.userId).toBe('user-1');
  });

  it('rejects a token signed with a different secret', () => {
    const token = signToken({ userId: 'user-1' }, secret, 60_000);
    expect(() => verifyToken(token, 'b'.repeat(32))).toThrow(InvalidSignedTokenError);
  });

  it('rejects a tampered payload', () => {
    const token = signToken({ userId: 'user-1' }, secret, 60_000);
    const [body, signature] = token.split('.');
    const tampered = `${body}x.${signature}`;
    expect(() => verifyToken(tampered, secret)).toThrow(InvalidSignedTokenError);
  });

  it('rejects an expired token', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const token = signToken({ userId: 'user-1' }, secret, 1000, now);
    const later = new Date(now.getTime() + 5000);
    expect(() => verifyToken(token, secret, later)).toThrow(InvalidSignedTokenError);
  });

  it('rejects a malformed token', () => {
    expect(() => verifyToken('not-a-token', secret)).toThrow(InvalidSignedTokenError);
  });
});
