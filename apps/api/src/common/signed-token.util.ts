import { createHmac, timingSafeEqual } from 'node:crypto';

// Minimal stateless signed-token helper (HMAC-SHA256), used for
// short-lived, server-issued tokens that intentionally do not need a
// database row: the mobile access token and the "ward code required"
// login ticket. Session/refresh tokens themselves are opaque random
// values whose *hash* is stored in UserSession — this utility is not used
// for those (see session-token.util.ts).
//
// This is deliberately not a general-purpose JWT implementation: no
// algorithm negotiation, no external library. A fixed HMAC-SHA256 scheme
// avoids the classic "alg: none" JWT confusion class of vulnerabilities.

function base64UrlEncode(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url');
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, 'base64url').toString('utf8');
}

export function signToken<TPayload extends Record<string, unknown>>(
  payload: TPayload,
  secret: string,
  expiresInMs: number,
  now: Date = new Date(),
): string {
  const body = { ...payload, exp: now.getTime() + expiresInMs };
  const encodedBody = base64UrlEncode(JSON.stringify(body));
  const signature = createHmac('sha256', secret).update(encodedBody).digest('base64url');
  return `${encodedBody}.${signature}`;
}

export class InvalidSignedTokenError extends Error {
  constructor(reason: string) {
    super(`Invalid signed token: ${reason}`);
    this.name = 'InvalidSignedTokenError';
  }
}

export function verifyToken<TPayload extends Record<string, unknown>>(
  token: string,
  secret: string,
  now: Date = new Date(),
): TPayload & { exp: number } {
  const parts = token.split('.');
  if (parts.length !== 2) {
    throw new InvalidSignedTokenError('malformed token');
  }
  const [encodedBody, signature] = parts as [string, string];

  const expectedSignature = createHmac('sha256', secret).update(encodedBody).digest('base64url');
  const signatureBuffer = Buffer.from(signature, 'base64url');
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url');
  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    throw new InvalidSignedTokenError('signature mismatch');
  }

  const parsed = JSON.parse(base64UrlDecode(encodedBody)) as TPayload & { exp: number };
  if (typeof parsed.exp !== 'number' || parsed.exp <= now.getTime()) {
    throw new InvalidSignedTokenError('expired');
  }

  return parsed;
}
