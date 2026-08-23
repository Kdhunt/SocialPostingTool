export const TOTP_CODE_LENGTH = 6;
export const TOTP_LOCKOUT_THRESHOLD = 5;
export const TOTP_MAX_LOCKOUT_MS = 30 * 60 * 1000;

export interface TotpUserState {
  totpSecretEncrypted: string | null;
  totpEnabledAt: Date | null;
  totpLockedUntil: Date | null;
}

/** True when the user has completed TOTP enrollment. */
export function isTotpEnabled(user: TotpUserState): boolean {
  return user.totpEnabledAt !== null && user.totpSecretEncrypted !== null;
}

/** True when a secret is stored but enrollment is not yet confirmed. */
export function isTotpEnrollmentPending(user: TotpUserState): boolean {
  return user.totpSecretEncrypted !== null && user.totpEnabledAt === null;
}

export function validateTotpCodeFormat(code: string): boolean {
  return /^\d{6}$/.test(code);
}

export function isTotpLocked(lockedUntil: Date | null, now: Date = new Date()): boolean {
  return lockedUntil !== null && lockedUntil.getTime() > now.getTime();
}

export function computeTotpLockedUntil(failedAttempts: number, now: Date = new Date()): Date | null {
  if (failedAttempts < TOTP_LOCKOUT_THRESHOLD) {
    return null;
  }
  const exponent = Math.min(failedAttempts - TOTP_LOCKOUT_THRESHOLD, 5);
  const lockoutMs = Math.min(60_000 * 2 ** exponent, TOTP_MAX_LOCKOUT_MS);
  return new Date(now.getTime() + lockoutMs);
}
