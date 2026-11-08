import { readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';
import { buildMockWard } from './build';
import { applyLocalE2eEnv, localApiUrl, localWebUrl, mailDir } from './env';

/** Pages compiled on first request by `nuxt dev`; visiting them once keeps the first real test from timing out. */
const WARM_UP_PATHS = [
  '/login',
  '/',
  '/directory',
  '/directory/households',
  '/campaigns',
  '/bulletins',
  '/audiences',
  '/admin/users',
  '/settings/account',
];

export default async function globalSetup(_config: FullConfig): Promise<void> {
  applyLocalE2eEnv();
  // Empty the local inbox from any previous run (the catcher keeps running, so keep the folder).
  for (const file of readdirSync(mailDir, { withFileTypes: true })) {
    if (file.isFile()) rmSync(path.join(mailDir, file.name));
  }
  const started = Date.now();
  await buildMockWard(localApiUrl);
  console.log(`[mock-ward] built in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    for (const path of WARM_UP_PATHS) {
      await page
        .goto(`${localWebUrl}${path}`, { waitUntil: 'load', timeout: 120_000 })
        .catch(() => undefined);
    }
  } finally {
    await browser.close();
  }
}
