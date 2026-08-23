// Account lockout / backoff policy — pure functions over
// ApplicationUser.failedLoginAttempts / lockedUntil. The attempted
// password itself is never part of this policy or persisted anywhere
// (see AGENTS.md #2, security.mdc).

/** Number of consecutive failed attempts before an account is locked. */
export const LOCKOUT_THRESHOLD = 5;

/** Base backoff duration; doubles per attempt past the threshold, capped. */
const BASE_LOCKOUT_MS = 60_000;
const MAX_LOCKOUT_MS = 30 * 60_000;

/**
 * Computes how long an account should remain locked given the number of
 * consecutive failed attempts (including the one that just occurred).
 * Returns 0 when the account should not be locked yet.
 */
export function computeLockoutDurationMs(failedAttempts: number): number {
  if (failedAttempts < LOCKOUT_THRESHOLD) {
    return 0;
  }

  const overBy = failedAttempts - LOCKOUT_THRESHOLD;
  const durationMs = BASE_LOCKOUT_MS * 2 ** overBy;
  return Math.min(durationMs, MAX_LOCKOUT_MS);
}

/** Whether the account is currently locked as of `now`. */
export function isAccountLocked(lockedUntil: Date | null | undefined, now: Date = new Date()): boolean {
  if (!lockedUntil) {
    return false;
  }
  return lockedUntil.getTime() > now.getTime();
}

/**
 * Given the failed-attempt count *after* incrementing it for this
 * attempt, returns the new `lockedUntil` value (or `null` if no lock
 * should be applied yet).
 */
export function computeLockedUntil(failedAttemptsAfterThisFailure: number, now: Date = new Date()): Date | null {
  const durationMs = computeLockoutDurationMs(failedAttemptsAfterThisFailure);
  if (durationMs <= 0) {
    return null;
  }
  return new Date(now.getTime() + durationMs);
}
