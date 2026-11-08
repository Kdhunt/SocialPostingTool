// Session lifetime policy shared by web (HTTP-only cookie) and mobile
// (short-lived access token + longer-lived refresh/session token) flows.

/** Web browser session cookie lifetime (re-authenticated via ward code after this). */
export const WEB_SESSION_TTL_MS = 12 * 60 * 60_000; // 12 hours

/** Mobile stateless access token lifetime. */
export const MOBILE_ACCESS_TOKEN_TTL_MS = 15 * 60_000; // 15 minutes

/** Mobile refresh/session token lifetime (rotated on each successful refresh). */
export const MOBILE_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60_000; // 30 days

/** A signed "ward code required" login ticket lifetime — short by design. */
export const LOGIN_TICKET_TTL_MS = 5 * 60_000; // 5 minutes

export function isSessionExpired(expiresAt: Date, now: Date = new Date()): boolean {
  return expiresAt.getTime() <= now.getTime();
}

export function isSessionRevoked(revokedAt: Date | null | undefined): boolean {
  return revokedAt != null;
}

export function isSessionValid(
  session: { expiresAt: Date; revokedAt: Date | null | undefined },
  now: Date = new Date(),
): boolean {
  return !isSessionExpired(session.expiresAt, now) && !isSessionRevoked(session.revokedAt);
}

/**
 * How often a session's `lastUsedAt` is written. Every authenticated API
 * call validates the session, so writing it on each call doubled the
 * database work for no benefit: nothing expires sessions on idle time, and
 * "last used" only needs to be roughly right for an administrator.
 */
export const SESSION_TOUCH_INTERVAL_MS = 5 * 60_000; // 5 minutes

/** Whether a validated session's `lastUsedAt` is stale enough to write again. */
export function shouldTouchSession(
  lastUsedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return lastUsedAt == null || now.getTime() - lastUsedAt.getTime() >= SESSION_TOUCH_INTERVAL_MS;
}
