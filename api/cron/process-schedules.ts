import 'reflect-metadata';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertCronAuthorized } from '../../apps/api/src/background/cron-auth.js';
import { runSchedulePoller } from '../../apps/api/src/background/run-background-jobs.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    assertCronAuthorized(req);
    const started = await runSchedulePoller();
    res.status(200).json({ ok: true, started });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron job failed.';
    const status = message.startsWith('Unauthorized') ? 401 : 500;
    res.status(status).json({ ok: false, error: message });
  }
}
