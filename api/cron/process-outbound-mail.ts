import 'reflect-metadata';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { assertCronAuthorized } from '../../apps/api/src/background/cron-auth.js';
import { runOutboundMailDrain } from '../../apps/api/src/background/run-background-jobs.js';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    assertCronAuthorized(req);
    const processed = await runOutboundMailDrain();
    console.log(JSON.stringify({ job: 'process-outbound-mail', ok: true, processed }));
    res.status(200).json({ ok: true, processed });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Cron job failed.';
    const status = message.startsWith('Unauthorized') ? 401 : 500;
    // Message only: never the request, headers or payload (AGENTS.md rule 2).
    console.error(JSON.stringify({ job: 'process-outbound-mail', ok: false, status, error: message }));
    res.status(status).json({ ok: false, error: message });
  }
}
