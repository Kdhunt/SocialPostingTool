// Account email-verification and password-reset token policy.
//
// Requirement: inbox confirmation after create-user / create-ward admin,
// plus email-based password reset (AGENTS.md; docs/threat-model-auth.md).
// Tokens are hashed at rest by the application layer (SHA-256, same as
// session tokens). This module is framework-independent: TTL, rate limits,
// and consume rules only.

export const ACCOUNT_TOKEN_PURPOSES = ['EmailVerification', 'PasswordReset'] as const;
export type AccountTokenPurpose = (typeof ACCOUNT_TOKEN_PURPOSES)[number];

/** Email verification links stay valid long enough for a delayed inbox check. */
export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;

/** Password reset links are short-lived to limit replay after inbox access. */
export const PASSWORD_RESET_TTL_MS = 60 * 60_000;

/** Max unused/recent tokens per user+purpose inside the rate-limit window. */
export const ACCOUNT_TOKEN_RATE_LIMIT_MAX = 3;

export const ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS = 15 * 60_000;

export function accountTokenTtlMs(purpose: AccountTokenPurpose): number {
  return purpose === 'PasswordReset' ? PASSWORD_RESET_TTL_MS : EMAIL_VERIFICATION_TTL_MS;
}

export function computeAccountTokenExpiry(purpose: AccountTokenPurpose, now: Date = new Date()): Date {
  return new Date(now.getTime() + accountTokenTtlMs(purpose));
}

export function isAccountTokenExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function isAccountTokenConsumed(consumedAt: Date | null | undefined): boolean {
  return consumedAt != null;
}

export function isAccountTokenUsable(
  token: { expiresAt: Date; consumedAt: Date | null | undefined },
  now: Date = new Date(),
): boolean {
  return !isAccountTokenExpired(token.expiresAt, now) && !isAccountTokenConsumed(token.consumedAt);
}

export interface AccountTokenIssueDecision {
  allowed: boolean;
  retryAfterMs: number | null;
}

/**
 * Limits how often a verification or reset email can be issued for one
 * user+purpose. `recentCreatedAt` should include tokens created within
 * `ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS` (consumed or not).
 */
export function canIssueAccountToken(
  recentCreatedAt: Date[],
  now: Date = new Date(),
): AccountTokenIssueDecision {
  const windowStart = now.getTime() - ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS;
  const inWindow = recentCreatedAt
    .map((createdAt) => createdAt.getTime())
    .filter((createdAt) => createdAt > windowStart)
    .sort((a, b) => a - b);

  if (inWindow.length < ACCOUNT_TOKEN_RATE_LIMIT_MAX) {
    return { allowed: true, retryAfterMs: null };
  }

  const oldestInBudget = inWindow[0];
  if (oldestInBudget === undefined) {
    return { allowed: true, retryAfterMs: null };
  }

  return {
    allowed: false,
    retryAfterMs: oldestInBudget + ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS - now.getTime(),
  };
}
