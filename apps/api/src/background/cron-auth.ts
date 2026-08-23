import type { VercelRequest } from '@vercel/node';

/**
 * Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. Reject manual hits
 * without the configured secret (see docs/vercel.md).
 */
export function assertCronAuthorized(req: VercelRequest): void {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    throw new Error('CRON_SECRET is not configured.');
  }

  const header = req.headers.authorization;
  if (header !== `Bearer ${secret}`) {
    throw new Error('Unauthorized cron invocation.');
  }
}
