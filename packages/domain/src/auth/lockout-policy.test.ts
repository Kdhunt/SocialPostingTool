import { describe, expect, it } from 'vitest';
import {
  computeLockedUntil,
  computeLockoutDurationMs,
  isAccountLocked,
  LOCKOUT_THRESHOLD,
} from './lockout-policy.js';

describe('computeLockoutDurationMs', () => {
  it('does not lock the account before reaching the threshold', () => {
    for (let attempts = 0; attempts < LOCKOUT_THRESHOLD; attempts += 1) {
      expect(computeLockoutDurationMs(attempts)).toBe(0);
    }
  });

  it('locks the account once the threshold is reached', () => {
    expect(computeLockoutDurationMs(LOCKOUT_THRESHOLD)).toBeGreaterThan(0);
  });

  it('increases the backoff duration for repeated failures past the threshold', () => {
    const first = computeLockoutDurationMs(LOCKOUT_THRESHOLD);
    const second = computeLockoutDurationMs(LOCKOUT_THRESHOLD + 1);
    const third = computeLockoutDurationMs(LOCKOUT_THRESHOLD + 2);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it('caps the backoff duration rather than growing unbounded', () => {
    const huge = computeLockoutDurationMs(LOCKOUT_THRESHOLD + 20);
    const evenHuger = computeLockoutDurationMs(LOCKOUT_THRESHOLD + 21);
    expect(huge).toBe(evenHuger);
  });
});

describe('isAccountLocked', () => {
  it('is false when lockedUntil is null', () => {
    expect(isAccountLocked(null)).toBe(false);
  });

  it('is true when lockedUntil is in the future', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const lockedUntil = new Date('2026-01-01T00:05:00Z');
    expect(isAccountLocked(lockedUntil, now)).toBe(true);
  });

  it('is false once lockedUntil has passed', () => {
    const now = new Date('2026-01-01T00:10:00Z');
    const lockedUntil = new Date('2026-01-01T00:05:00Z');
    expect(isAccountLocked(lockedUntil, now)).toBe(false);
  });
});

describe('computeLockedUntil', () => {
  it('returns null before the threshold', () => {
    expect(computeLockedUntil(LOCKOUT_THRESHOLD - 1)).toBeNull();
  });

  it('returns a future date at/after the threshold', () => {
    const now = new Date('2026-01-01T00:00:00Z');
    const lockedUntil = computeLockedUntil(LOCKOUT_THRESHOLD, now);
    expect(lockedUntil).not.toBeNull();
    expect((lockedUntil as Date).getTime()).toBeGreaterThan(now.getTime());
  });
});
