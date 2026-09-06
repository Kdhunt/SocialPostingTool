import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_TOKEN_RATE_LIMIT_MAX,
  ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS,
  EMAIL_VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS,
  accountTokenTtlMs,
  canIssueAccountToken,
  computeAccountTokenExpiry,
  isAccountTokenUsable,
} from './account-token-policy.js';

describe('accountTokenTtlMs', () => {
  it('gives verification a longer lifetime than password reset', () => {
    expect(accountTokenTtlMs('EmailVerification')).toBe(EMAIL_VERIFICATION_TTL_MS);
    expect(accountTokenTtlMs('PasswordReset')).toBe(PASSWORD_RESET_TTL_MS);
    expect(EMAIL_VERIFICATION_TTL_MS).toBeGreaterThan(PASSWORD_RESET_TTL_MS);
  });
});

describe('computeAccountTokenExpiry', () => {
  it('adds the purpose TTL to the given instant', () => {
    const now = new Date('2026-09-06T00:00:00.000Z');
    expect(computeAccountTokenExpiry('PasswordReset', now).toISOString()).toBe('2026-09-06T01:00:00.000Z');
  });
});

describe('isAccountTokenUsable', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');

  it('accepts an unconsumed token that has not expired', () => {
    expect(
      isAccountTokenUsable({ expiresAt: new Date('2026-09-06T13:00:00.000Z'), consumedAt: null }, now),
    ).toBe(true);
  });

  it('rejects an expired token', () => {
    expect(
      isAccountTokenUsable({ expiresAt: new Date('2026-09-06T11:59:00.000Z'), consumedAt: null }, now),
    ).toBe(false);
  });

  it('rejects a consumed token even if the expiry is in the future', () => {
    expect(
      isAccountTokenUsable(
        { expiresAt: new Date('2026-09-06T13:00:00.000Z'), consumedAt: new Date('2026-09-06T11:00:00.000Z') },
        now,
      ),
    ).toBe(false);
  });
});

describe('canIssueAccountToken', () => {
  const now = new Date('2026-09-06T12:00:00.000Z');

  it('allows the first token', () => {
    expect(canIssueAccountToken([], now).allowed).toBe(true);
  });

  it('allows up to the max inside the window', () => {
    const recent = Array.from({ length: ACCOUNT_TOKEN_RATE_LIMIT_MAX - 1 }, (_, index) => {
      return new Date(now.getTime() - index * 60_000);
    });
    expect(canIssueAccountToken(recent, now).allowed).toBe(true);
  });

  it('blocks a fourth token inside the window and reports retry-after', () => {
    const oldest = new Date(now.getTime() - 5 * 60_000);
    const recent = [
      oldest,
      new Date(now.getTime() - 3 * 60_000),
      new Date(now.getTime() - 1 * 60_000),
    ];
    const decision = canIssueAccountToken(recent, now);
    expect(decision.allowed).toBe(false);
    expect(decision.retryAfterMs).toBe(ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS - 5 * 60_000);
  });

  it('ignores tokens older than the window', () => {
    const recent = [
      new Date(now.getTime() - ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS - 1),
      new Date(now.getTime() - ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS - 2),
      new Date(now.getTime() - ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS - 3),
    ];
    expect(canIssueAccountToken(recent, now).allowed).toBe(true);
  });
});
