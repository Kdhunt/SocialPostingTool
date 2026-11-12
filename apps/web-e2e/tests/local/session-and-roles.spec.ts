import type { Page } from '@playwright/test';
import { localApiUrl } from '../../mock-ward/env';
import {
  createThrowawayUser,
  expect,
  fill,
  heading,
  open,
  primaryNav,
  signInThroughForm,
  test,
  waitForHydration,
} from './helpers/fixtures';
import { as } from './helpers/sessions';

function countSessionChecks(page: Page): { count: () => number } {
  let count = 0;
  page.on('request', (request) => {
    if (request.url().startsWith(`${localApiUrl}/auth/session`)) count += 1;
  });
  return { count: () => count };
}

// Contexts made inside a test inherit the describe's saved sign-in, so start these from an empty one.
const SIGNED_OUT = { storageState: { cookies: [], origins: [] } };

test.describe('Sign-in check performance', () => {
  test.use(as('wardAdmin'));

  test('a full page load checks the session once, and moving between pages does not check again', async ({
    page,
  }) => {
    const checks = countSessionChecks(page);
    await open(page, '/campaigns');
    await page.waitForLoadState('networkidle');
    expect(checks.count()).toBe(1);

    for (const [label, title] of [
      ['People', 'Directory'],
      ['Audiences', 'Audiences'],
      ['Bulletins', 'Bulletins'],
      ['Home', /^Welcome/],
    ] as const) {
      await primaryNav(page).locator('nav').getByRole('link', { name: label, exact: true }).click();
      await heading(page, title);
    }
    await page.waitForLoadState('networkidle');
    expect(checks.count()).toBe(1);
  });

  test('a page asks for its data without waiting on a second session check', async ({ page }) => {
    const order: string[] = [];
    page.on('request', (request) => {
      if (request.url().startsWith(localApiUrl)) order.push(new URL(request.url()).pathname);
    });
    await open(page, '/directory');
    await expect(page.locator('ul.results li').first()).toBeVisible();
    expect(order.filter((path) => path === '/auth/session')).toHaveLength(1);
    expect(order).toContain('/directory/people');
  });
});

test.describe('Expired sessions and returning after sign-in', () => {
  test.use(as('wardAdmin'));

  test('when the session ends elsewhere, the next action sends the user to sign in and back', async ({
    browser,
    api,
    ward,
  }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward, ['Contributor']);
    const context = await browser.newContext(SIGNED_OUT);
    const page = await context.newPage();
    try {
      await signInThroughForm(page, user);
      await heading(page, `Welcome, ${user.displayName}`);
      await primaryNav(page).getByRole('link', { name: 'Campaigns' }).click();
      await heading(page, 'Campaigns');

      // End the session server-side (as a password change or an admin would).
      expect((await page.request.post(`${localApiUrl}/auth/logout`)).ok()).toBe(true);
      await primaryNav(page).getByRole('link', { name: 'Audiences' }).click();
      await expect(page).toHaveURL(/\/login\?redirect=(%2F|\/)audiences/);

      await fill(page, '#unit-code', user.unitCode);
      await fill(page, '#username', user.username);
      await fill(page, '#password', user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await expect(page).toHaveURL(/\/audiences$/);
      await heading(page, 'Audiences');
    } finally {
      await context.close();
    }
  });

  test('opening a signed-in page while signed out comes back to it after sign-in', async ({
    browser,
    api,
    ward,
  }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const context = await browser.newContext(SIGNED_OUT);
    const page = await context.newPage();
    try {
      await page.goto(`/directory/people/${ward.people.aaron}`);
      await expect(page).toHaveURL(/\/login\?redirect=/);
      await waitForHydration(page);
      await fill(page, '#unit-code', user.unitCode);
      await fill(page, '#username', user.username);
      await fill(page, '#password', user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await heading(page, 'Aaron Abernathy');
    } finally {
      await context.close();
    }
  });

  test('a redirect to another site is ignored after sign-in', async ({ browser, api, ward }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const context = await browser.newContext(SIGNED_OUT);
    const page = await context.newPage();
    try {
      await open(page, '/login?redirect=//evil.example.test/phish');
      await fill(page, '#unit-code', user.unitCode);
      await fill(page, '#username', user.username);
      await fill(page, '#password', user.password);
      await page.getByRole('button', { name: 'Sign in' }).click();
      await heading(page, `Welcome, ${user.displayName}`);
      await expect(page).toHaveURL(/localhost:\d+\/$/);
    } finally {
      await context.close();
    }
  });

  test('signing out lands on the sign-in page', async ({ browser, api, ward }) => {
    const user = await createThrowawayUser(await api('wardAdmin'), ward);
    const context = await browser.newContext(SIGNED_OUT);
    const page = await context.newPage();
    try {
      await signInThroughForm(page, user);
      await heading(page, `Welcome, ${user.displayName}`);
      await primaryNav(page).getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login$/);
      await heading(page, 'Sign in');
    } finally {
      await context.close();
    }
  });
});

test.describe('What a Viewer is offered', () => {
  test.use(as('viewer'));

  test('home shows only the directory, with no campaign panels and no refused requests', async ({
    page,
  }) => {
    const refused: string[] = [];
    page.on('response', (response) => {
      if (response.status() === 403) refused.push(new URL(response.url()).pathname);
    });
    await open(page, '/');
    await heading(page, /^Welcome/);
    const actions = page.getByRole('region', { name: 'Quick actions' });
    await expect(actions.getByRole('link')).toHaveCount(1);
    await expect(actions.getByRole('link', { name: /^Directory/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Recent campaigns' })).toHaveCount(0);
    await page.waitForLoadState('networkidle');
    expect(refused).toEqual([]);
  });

  test('people and households are read-only, without add or edit controls', async ({
    page,
    ward,
  }) => {
    await open(page, '/directory');
    await expect(page.locator('ul.results li').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add person' })).toHaveCount(0);

    await open(page, `/directory/people/${ward.people.aaron}`);
    await expect(
      page.getByText('You can view this record but your role can’t change it.'),
    ).toBeVisible();
    await expect(page.locator('#edit-first-name')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save profile' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Contact & consent' }).click();
    await expect(page.getByText('aaron.abernathy@example.test')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Grant' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add contact method' })).toHaveCount(0);

    await open(page, '/directory/households');
    await expect(page.getByRole('link', { name: 'Add household' })).toHaveCount(0);
    await open(page, `/directory/households/${ward.households.abernathy}`);
    await expect(
      page.getByText('You can view this household but your role can’t change it.'),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark inactive' })).toHaveCount(0);
  });

  test('opening a page the role cannot use by address shows a plain-language message', async ({
    page,
  }) => {
    await open(page, '/bulletins');
    await expect(page.getByRole('alert')).toContainText(
      'Your role doesn’t include access to this.',
    );
    await expect(page.getByText(/Missing required permission/)).toHaveCount(0);
  });
});
