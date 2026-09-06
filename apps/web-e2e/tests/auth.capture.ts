import { chromium, expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { authStatePath, e2eBaseUrl, e2eCdpUrl } from './helpers/env';

interface PlaywrightStorageState {
  cookies: Array<{ domain: string; name: string }>;
  origins: Array<{ origin: string }>;
}

function hostFromBaseUrl(): string {
  return new URL(e2eBaseUrl()).hostname.replace(/^www\./, '');
}

function filterStorageState(state: PlaywrightStorageState, siteHost: string): PlaywrightStorageState {
  return {
    cookies: state.cookies.filter((cookie) => cookie.domain.includes(siteHost)),
    origins: state.origins.filter((origin) => {
      try {
        return new URL(origin.origin).hostname.includes(siteHost);
      } catch {
        return false;
      }
    }),
  };
}

function writeAuthState(state: PlaywrightStorageState): void {
  const siteHost = hostFromBaseUrl();
  const filtered = filterStorageState(state, siteHost);
  if (filtered.cookies.length === 0) {
    throw new Error(
      `No cookies for ${siteHost} in the connected browser. Sign in at ${e2eBaseUrl()} first, then rerun.`,
    );
  }

  mkdirSync(path.dirname(authStatePath), { recursive: true });
  writeFileSync(authStatePath, `${JSON.stringify(filtered, null, 2)}\n`, 'utf8');
}

test('save signed-in storage state', async ({ page, context }) => {
  const cdpUrl = process.env.E2E_CDP_URL?.trim();

  if (cdpUrl || process.env.E2E_USE_CDP === '1') {
    const browser = await chromium.connectOverCDP(e2eCdpUrl());
    const cdpContext = browser.contexts()[0];
    if (!cdpContext) {
      throw new Error('Chrome DevTools is connected but has no open context. Open a tab to the site and retry.');
    }
    writeAuthState(await cdpContext.storageState());
    return;
  }

  await page.goto('/');
  const signedOut = page.getByRole('heading', { name: 'Sign in' });
  const signedIn = page.getByRole('button', { name: 'Sign out' });
  await expect(signedOut.or(signedIn)).toBeVisible({ timeout: 30_000 });

  if (await signedOut.isVisible()) {
    await expect(signedIn).toBeVisible({
      timeout: 5 * 60_000,
    });
  }

  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  writeAuthState(await context.storageState());
});
