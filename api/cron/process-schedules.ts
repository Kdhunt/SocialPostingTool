import 'reflect-metadata';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertCronAuthorized } from '../../apps/api/src/background/cron-auth.js';
import { runSchedulePoller } from '../../apps/api/src/background/run-background-jobs.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    assertCronAuthorized(req);
    const started = await runSchedulePoller();
    console.log(JSON.stringify({ job: 'process-schedules', ok: true, started }));
    res.status(200).json({ ok: true, started });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron job failed.';
    const status = message.startsWith('Unauthorized') ? 401 : 500;
    // Message only: never the request, headers or payload (AGENTS.md rule 2).
    console.error(JSON.stringify({ job: 'process-schedules', ok: false, status, error: message }));
    res.status(status).json({ ok: false, error: message });
  }
}
