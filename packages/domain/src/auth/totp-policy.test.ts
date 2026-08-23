import { describe, expect, it } from 'vitest';
import {
  computeTotpLockedUntil,
  isTotpEnabled,
  isTotpEnrollmentPending,
  isTotpLocked,
  validateTotpCodeFormat,
} from './totp-policy.js';

describe('totp-policy', () => {
  it('detects enabled and pending enrollment states', () => {
    expect(isTotpEnabled({ totpSecretEncrypted: 'enc', totpEnabledAt: new Date(), totpLockedUntil: null })).toBe(true);
    expect(isTotpEnrollmentPending({ totpSecretEncrypted: 'enc', totpEnabledAt: null, totpLockedUntil: null })).toBe(true);
    expect(isTotpEnabled({ totpSecretEncrypted: null, totpEnabledAt: null, totpLockedUntil: null })).toBe(false);
  });

  it('validates six-digit codes only', () => {
    expect(validateTotpCodeFormat('123456')).toBe(true);
    expect(validateTotpCodeFormat('12345')).toBe(false);
    expect(validateTotpCodeFormat('1234567')).toBe(false);
    expect(validateTotpCodeFormat('12ab56')).toBe(false);
  });

  it('locks after repeated failures', () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    expect(computeTotpLockedUntil(4, now)).toBeNull();
    const lockedUntil = computeTotpLockedUntil(5, now);
    expect(lockedUntil).not.toBeNull();
    expect(isTotpLocked(lockedUntil, now)).toBe(true);
  });
});
