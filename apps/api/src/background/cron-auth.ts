import type { VercelRequest } from '@vercel/node';

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject manual hits
 * without the configured secret (see docs/vercel.md).
 */
export function assertCronAuthorized(req: VercelRequest): void {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    throw new Error('CRON_SECRET is not configured.');
  }

  const header = typeof req.headers.authorization === 'string' ? req.headers.authorization.trim() : undefined;
  if (header !== `Bearer ${secret}`) {
    throw new Error('Unauthorized cron invocation.');
  }
}
