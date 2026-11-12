import { test as setup, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { localApiUrl, stateDir } from '../../mock-ward/env';
import { SESSIONS, storageStatePath, type SessionKey } from './helpers/sessions';

/**
 * Signs in once per role through the real cookie endpoint and saves the
 * browser state, so specs start already signed in. Each sign-in counts
 * against the API's per-address login budget, so this runs exactly once.
 */
for (const key of Object.keys(SESSIONS) as SessionKey[]) {
  setup(`sign in as ${key}`, async ({ page }) => {
    mkdirSync(stateDir, { recursive: true });
    const credentials = SESSIONS[key];
    const response = await page.request.post(`${localApiUrl}/auth/login`, {
      data: {
        username: credentials.username,
        password: credentials.password,
        clientType: 'web',
        ...(credentials.unitCode ? { unitCode: credentials.unitCode } : {}),
      },
    });
    expect(response.status(), await response.text()).toBe(200);
    expect((await response.json()).status).toBe('ok');
    await page.context().storageState({ path: storageStatePath(key) });
  });
}
