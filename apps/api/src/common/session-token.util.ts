import { createHash, randomBytes } from 'node:crypto';

/**
 * Generates a new opaque, high-entropy session/refresh token. Only the
 * hash of this value is ever persisted (UserSession.sessionTokenHash /
 * refreshTokenHash) — the raw value is returned to the caller exactly
 * once so it can be sent to the client (as an HTTP-only cookie for web,
 * or in the JSON body for mobile) and never stored server-side.
 */
export function generateOpaqueToken(): string {
  return randomBytes(32).toString('base64url');
}

/** One-way hash used to look up a session/refresh token without storing the raw value. */
export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
