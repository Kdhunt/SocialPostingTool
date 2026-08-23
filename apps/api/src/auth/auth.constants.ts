/** HTTP-only session cookie for the web app. Never read via client-side JS. */
export const SESSION_COOKIE_NAME = 'session_token';

/**
 * HTTP-only, non-secret device identifier cookie. Not a credential — used
 * only to recognize "this browser has already verified the current ward
 * code" so we don't over-prompt for it (see ward-code-policy.ts). Long
 * lived by design.
 */
export const DEVICE_ID_COOKIE_NAME = 'device_id';

export const DEVICE_ID_COOKIE_TTL_MS = 365 * 24 * 60 * 60_000;
