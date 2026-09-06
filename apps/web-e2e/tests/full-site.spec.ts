import { test, expect, type Page } from '@playwright/test';
import { expectPageHeading, primaryNav } from './helpers/auth';

/**
 * Live-site walk of every primary surface.
 * Each test is independent. Fictional names only.
 * Does not rotate the production ward code, reset the signed-in admin password,
 * or provision a real tenant.
 */

function fictionalSuffix(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

async function expectSettledList(page: Page): Promise<void> {
  const loading = page.getByText(/Loading|Loading activity/i).first();
  if (await loading.isVisible().catch(() => false)) {
    await expect(loading).toBeHidden({ timeout: 20_000 });
  }
}

test.describe('Full site — authenticated admin', () => {
  test('home, security, and primary navigation', async ({ page }) => {
    await page.goto('/');
    await expectPageHeading(page, /^Welcome/);
    await expect(page.getByRole('heading', { name: 'Directory' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent campaigns' })).toBeVisible();
    await expectSettledList(page);

    const nav = primaryNav(page);
    await nav.getByRole('link', { name: 'Security' }).click();
    await expectPageHeading(page, 'Security');
    await expect(
      page.getByRole('heading', { name: /two-factor authentication/i }).or(page.getByText(/authenticator app/i)),
    ).toBeVisible();

    await nav.getByRole('link', { name: 'People' }).click();
    await expectPageHeading(page, 'Directory');
    await nav.getByRole('link', { name: 'Households' }).click();
    await expectPageHeading(page, 'Households');
    await nav.getByRole('link', { name: 'Campaigns' }).click();
    await expectPageHeading(page, 'Campaigns');
    await nav.getByRole('link', { name: 'Audiences' }).click();
    await expectPageHeading(page, 'Audiences');
    await nav.getByRole('link', { name: 'Destinations' }).click();
    await expectPageHeading(page, 'Communication destinations');
    await nav.getByRole('link', { name: 'Home' }).click();
    await expectPageHeading(page, /^Welcome/);
  });

  test('admin pages load for this operator', async ({ page }) => {
    await page.goto('/admin/users');
    await expectPageHeading(page, 'User management');
    await expect(page.getByRole('heading', { name: 'Create user' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();

    await page.goto('/admin/ward-code');
    await expectPageHeading(page, 'Ward code');
    await expect(page.getByRole('heading', { name: 'Rotate ward code' })).toBeVisible();
    await expect(page.getByLabel('New ward code')).toBeVisible();

    await page.goto('/admin/provider-credentials');
    await expectPageHeading(page, 'Provider credentials');
    await expect(page.getByRole('heading', { name: 'Upsert credentials' })).toBeVisible();
    await expect(page.getByLabel('Credentials JSON')).toBeVisible();

    await page.goto('/admin/audit');
    await expectPageHeading(page, 'Audit log');
    await expect(page.getByLabel('Action contains')).toBeVisible();
    await page.getByLabel('Action contains').fill('login');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(
      page.getByRole('table').or(page.getByText('No audit events found.')),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/admin/wards');
    if (await page.getByRole('heading', { name: 'Ward provisioning' }).isVisible()) {
      await expect(page.getByRole('heading', { name: 'Create ward' })).toBeVisible();
      await expect(page.getByLabel('Ward name')).toBeVisible();
    } else {
      await expect(page).not.toHaveURL(/\/login/);
    }
  });

  test('directory search, create form, and fictional person', async ({ page }) => {
    const suffix = fictionalSuffix();
    const last = `Person${suffix}`;

    await page.goto('/directory');
    await expectPageHeading(page, 'Directory');
    await expect(page.getByLabel('Search by name')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Add person' }).first()).toBeVisible();
    await page.getByLabel('Search by name').fill('Fictional');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(
      page.getByRole('link').filter({ hasText: /./ }).or(page.getByText('No people found')),
    ).toBeVisible({ timeout: 20_000 });

    await page.getByRole('link', { name: 'Add person' }).first().click();
    await expectPageHeading(page, 'Add person');
    await page.getByLabel('First name').fill('Fictional');
    await page.getByLabel('Last name').fill(last);
    await page.getByLabel('Preferred name (optional)').fill('Fic');
    await page.getByLabel('Gender').selectOption('NotSpecified');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/directory\/people\//, { timeout: 20_000 });
    await expect(page.getByText(last)).toBeVisible();

    await page.getByRole('tab', { name: 'Contact & consent' }).click();
    await expect(page.getByLabel('Value')).toBeVisible();
    await page.getByRole('tab', { name: 'Household' }).click();
    await expect(page.getByRole('button', { name: 'Add to household' })).toBeVisible();
    await page.getByRole('tab', { name: 'Family' }).click();
    await expect(page.getByRole('button', { name: 'Add relationship' })).toBeVisible();
    await page.getByRole('tab', { name: 'Profile' }).click();
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible();
  });

  test('households list and fictional household create', async ({ page }) => {
    const name = `Fictional Household ${fictionalSuffix()}`;

    await page.goto('/directory/households');
    await expectPageHeading(page, 'Households');
    await expect(page.getByRole('link', { name: 'Add household' })).toBeVisible();
    await expect(
      page.getByText(/Loading|No households yet|member\(s\)/).first(),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/directory/households/new');
    await expectPageHeading(page, 'Add household');
    await page.getByLabel('Household name').fill(name);
    await page.getByLabel('Address (optional)').fill('100 Fictional Way');
    await page.getByLabel('City').fill('Fictional City');
    await page.getByLabel('State').fill('UT');
    await page.getByLabel('Postal code').fill('84000');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/directory\/households\//, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members' })).toBeVisible();
  });

  test('campaigns search and fictional draft create', async ({ page }) => {
    const name = `Fictional Campaign ${fictionalSuffix()}`;

    await page.goto('/campaigns');
    await expectPageHeading(page, 'Campaigns');
    await expect(page.getByLabel('Search by name')).toBeVisible();
    await expect(page.getByLabel('Status')).toBeVisible();
    await page.getByLabel('Search by name').fill('Fictional');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(
      page.getByText('No campaigns found').or(page.getByRole('link').first()),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/campaigns/new');
    await expectPageHeading(page, 'Create campaign');
    await page.getByLabel('Campaign name').fill(name);
    await page.getByLabel('Base message (optional)').fill('Fictional e2e draft. Do not send.');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page).toHaveURL(/\/campaigns\//, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name })).toBeVisible();

    await expect(page.getByRole('tab', { name: 'Setup' })).toBeVisible();
    await page.getByRole('tab', { name: 'Content' }).click();
    await expect(page.getByRole('heading', { name: /Base message/ })).toBeVisible();
    await page.getByRole('tab', { name: 'Review' }).click();
    await expect(page.getByRole('heading', { name: 'Recipient preview' })).toBeVisible();
    await page.getByRole('button', { name: 'Check readiness' }).click();
    await expect(
      page.getByText(/Ready to submit|Unable to|must|required|audience|destination/i).first(),
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole('tab', { name: 'Approve & send' }).click();
    await expect(page.getByRole('heading', { name: 'Workflow actions' })).toBeVisible();
  });

  test('audiences search and fictional audience create', async ({ page }) => {
    const name = `Fictional Audience ${fictionalSuffix()}`;

    await page.goto('/audiences');
    await expectPageHeading(page, 'Audiences');
    await expect(page.getByLabel('Search by name')).toBeVisible();
    await page.getByLabel('Search by name').fill('Fictional');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(
      page.getByText('No audiences yet').or(page.getByRole('link').first()),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/audiences/new');
    await expectPageHeading(page, 'Create audience');
    await page.getByLabel('Audience name').fill(name);
    await page.getByLabel('Description (optional)').fill('Generated fictional audience for browser coverage.');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/audiences\//, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Audience info' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Membership rules' })).toBeVisible();
  });

  test('destinations form and fictional destination create', async ({ page }) => {
    const name = `Fictional Email ${fictionalSuffix()}`;

    await page.goto('/audiences/destinations');
    await expectPageHeading(page, 'Communication destinations');
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Channel')).toBeVisible();
    await page.getByLabel('Name').fill(name);
    await page.getByLabel('Channel').selectOption('Email');
    await page.getByRole('button', { name: 'Add destination' }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });
  });

  test('create a fictional ward user and reject a short password reset', async ({ page }) => {
    const suffix = fictionalSuffix();
    const username = `fic.user.${suffix}`;

    await page.goto('/admin/users');
    await expectPageHeading(page, 'User management');

    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Display name').fill(`Fictional User ${suffix}`);
    await page.getByLabel(/Password \(min 12/).fill('Fictional-User-42');
    const viewer = page.getByRole('checkbox', { name: 'Viewer' });
    await expect(viewer).toBeVisible();
    await viewer.check();
    await page.getByRole('button', { name: 'Create user' }).click();
    await expect(page.getByText(`@${username}`)).toBeVisible({ timeout: 20_000 });

    const row = page.locator('li', { hasText: `@${username}` });
    await row.getByRole('button', { name: 'Reset password' }).click();
    await page.getByLabel(new RegExp(`New password for ${username}`)).fill('short');
    await page.getByRole('button', { name: 'Save new password' }).click();
    await expect(page.getByText(/at least 12 characters|Unable to reset/i)).toBeVisible();
  });

  test('create-ward validation rejects a short password without provisioning', async ({ page }) => {
    await page.goto('/admin/wards');
    const createHeading = page.getByRole('heading', { name: 'Create ward' });
    test.skip(!(await createHeading.isVisible()), 'This account cannot open ward provisioning.');

    const suffix = fictionalSuffix();
    await page.getByLabel('Ward name').fill(`Fictional E2E Ward ${suffix}`);
    await page.getByLabel('Time zone').fill('America/Denver');
    await page.getByLabel('Initial admin username').fill(`admin.${suffix}`);
    await page.getByLabel('Initial admin display name').fill('Fictional Ward Admin');
    await page.getByLabel('Initial admin password').fill('short');
    await page.getByLabel('Initial ward code').fill('abc');
    await page.getByRole('button', { name: 'Create ward' }).click();
    await expect(page.getByRole('alert').first()).toBeVisible();
    await expect(page.getByText(/New ward created|was created/)).toHaveCount(0);
  });

  test('ward-code rotate form rejects a short code without submitting a real rotation', async ({ page }) => {
    await page.goto('/admin/ward-code');
    await expectPageHeading(page, 'Ward code');
    const codeField = page.getByLabel('New ward code');
    await expect(codeField).toBeVisible();
    await codeField.fill('abc');
    await page.getByRole('button', { name: 'Rotate ward code' }).click();
    await expect(page.getByRole('alert').or(page.getByText(/at least 4|unable to rotate|required/i))).toBeVisible();
    await expect(page.getByText(/Ward code rotated/i)).toHaveCount(0);
  });

  test('provider credentials form rejects invalid JSON without saving secrets', async ({ page }) => {
    await page.goto('/admin/provider-credentials');
    await expectPageHeading(page, 'Provider credentials');
    await page.getByLabel('Provider account reference').fill('fictional-e2e-ref');
    await page.getByLabel('Credentials JSON').fill('not-json');
    await page.getByRole('button', { name: 'Save credentials' }).click();
    await expect(page.getByText('Credentials must be valid JSON.')).toBeVisible();
  });

  test('existing list pages settle into empty or loaded state', async ({ page }) => {
    await page.goto('/directory');
    await expectPageHeading(page, 'Directory');
    await expect(
      page.getByText('No people found').or(page.locator('ul.results li').first()).or(page.getByRole('link').nth(1)),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/campaigns');
    await expectPageHeading(page, 'Campaigns');
    await expect(
      page.getByText('No campaigns found').or(page.getByRole('link', { name: /./ }).first()),
    ).toBeVisible({ timeout: 20_000 });

    await page.goto('/audiences');
    await expectPageHeading(page, 'Audiences');
    await expect(
      page.getByText('No audiences yet').or(page.getByRole('link', { name: /./ }).first()),
    ).toBeVisible({ timeout: 20_000 });
  });
});
