import {
  test as base,
  expect,
  request as playwrightRequest,
  type APIRequestContext,
  type Locator,
  type Page,
} from '@playwright/test';
import { localApiUrl } from '../../../mock-ward/env';
import { WARD_USERS, unitByKey, type MockUser } from '../../../mock-ward/fixture';
import { mockWard, type MockWardState } from '../../../mock-ward/state';
import { fillHydratedInput } from '../../helpers/auth';
import { storageStatePath, type SessionKey } from './sessions';

export { expect };

interface LocalFixtures {
  /** Ids of everything in the mock ward. */
  ward: MockWardState;
  /** An API client signed in as the given role (shares that role's saved cookie). */
  api: (key: SessionKey) => Promise<APIRequestContext>;
  /** An API client with no session. */
  anonymousApi: APIRequestContext;
}

/* Playwright requires object destructuring for fixture arguments, even when none are used. */
/* eslint-disable no-empty-pattern */
export const test = base.extend<LocalFixtures>({
  ward: async ({}, use) => {
    await use(mockWard());
  },
  api: async ({}, use) => {
    const contexts: APIRequestContext[] = [];
    await use(async (key) => {
      const context = await playwrightRequest.newContext({
        baseURL: localApiUrl,
        storageState: storageStatePath(key),
      });
      contexts.push(context);
      return context;
    });
    await Promise.all(contexts.map((context) => context.dispose()));
  },
  anonymousApi: async ({}, use) => {
    const context = await playwrightRequest.newContext({ baseURL: localApiUrl });
    await use(context);
    await context.dispose();
  },
});
/* eslint-enable no-empty-pattern */

/** Short unique suffix so records created by one test never collide with another's. */
export function unique(prefix = ''): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export async function heading(page: Page, name: string | RegExp, level = 1): Promise<void> {
  await expect(page.getByRole('heading', { name, level })).toBeVisible();
}

/** Waits until Nuxt has finished hydrating every component on the page, so clicks reach Vue handlers. */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const root = document.getElementById('__nuxt') as
      | (HTMLElement & { __vue_app__?: { config: { globalProperties: Record<string, unknown> } } })
      | null;
    const nuxt = root?.__vue_app__?.config.globalProperties.$nuxt as
      { isHydrating?: boolean } | undefined;
    return Boolean(nuxt) && nuxt?.isHydrating === false;
  });
}

/** Reloads and waits for hydration again. */
export async function reload(page: Page): Promise<void> {
  await page.reload();
  await waitForHydration(page);
}

/** Opens a page and waits for hydration, so clicks and typing reach the app rather than the static HTML. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForHydration(page);
}

export async function fill(page: Page, selector: string, value: string): Promise<void> {
  await fillHydratedInput(page, selector, value);
}

export function primaryNav(page: Page): Locator {
  return page.getByRole('complementary', { name: 'Primary' });
}

/** Accepts the next window.confirm / window.prompt, optionally typing an answer. */
export function acceptNextDialog(page: Page, answer?: string): void {
  page.once('dialog', (dialog) => void dialog.accept(answer));
}

export function dismissNextDialog(page: Page): void {
  page.once('dialog', (dialog) => void dialog.dismiss());
}

/** Signs in through the login form. Each call spends one of the API's per-address login attempts. */
export async function signInThroughForm(
  page: Page,
  credentials: { username: string; password: string; unitCode?: string },
): Promise<void> {
  await open(page, '/login');
  if (credentials.unitCode) {
    await fill(page, '#unit-code', credentials.unitCode);
  }
  await fill(page, '#username', credentials.username);
  await fill(page, '#password', credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

export interface ThrowawayUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  password: string;
  unitCode: string;
}

/**
 * Creates a fresh Maple Hollow account for a test that changes passwords,
 * email or two-factor settings, so shared role sessions are never revoked.
 */
export async function createThrowawayUser(
  adminApi: APIRequestContext,
  ward: MockWardState,
  roles: Array<'Viewer' | 'Contributor' | 'CommunicationsCoordinator' | 'WardAdmin'> = ['Viewer'],
): Promise<ThrowawayUser> {
  const suffix = unique();
  const user = {
    username: `fic.user.${suffix}`,
    email: `fic.user.${suffix}@maplehollow.example.test`,
    displayName: `Fictional Throwaway ${suffix}`,
    password: `Fictional-Pass-${suffix}-1`,
    unitCode: unitByKey('ward').code,
  };
  const response = await adminApi.post('/users', {
    data: {
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      password: user.password,
      roleIds: roles.map((role) => ward.roles[role]),
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  const body = (await response.json()) as { id: string };
  return { id: body.id, ...user };
}

export function wardUser(key: string): MockUser {
  const user = WARD_USERS.find((candidate) => candidate.key === key);
  if (!user) throw new Error(`Unknown ward user ${key}`);
  return user;
}
