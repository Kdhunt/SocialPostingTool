import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { e2eRoot } from '../../mock-ward/env';
import { unitByKey } from '../../mock-ward/fixture';
import { expect, heading, open, reload, signInThroughForm, test } from './helpers/fixtures';
import { SESSIONS, as } from './helpers/sessions';

/**
 * The training manual's walkthrough. It does, in order, what the manual
 * tells a new user to do, and saves a screenshot of every step into
 * apps/web-e2e/.manual/. The manual's pictures come from this run, so a
 * workflow that stops working fails here before the manual goes stale.
 *
 * Everything shown is the fictional mock ward, and the names used here are
 * fixed, so it relies on the stack's fresh database. Run on its own with:
 *   pnpm --filter @ward-comms/web-e2e exec playwright test \
 *     -c playwright.local.config.ts training-manual
 */
const shotsDir = path.join(e2eRoot, '.manual');
const VIEWPORT = { width: 1280, height: 860 };
const MAX_SHOT_HEIGHT = 1500;

async function shot(page: Page, name: string): Promise<void> {
  mkdirSync(shotsDir, { recursive: true });
  await page.waitForLoadState('networkidle');
  // The Nuxt dev toolbar is not part of the site.
  await page.addStyleTag({
    content: 'nuxt-devtools-frame, #nuxt-devtools-container { display: none !important; }',
  });
  // Long pages (audit log, user list) are cut to the part the manual talks about.
  const height = Math.min(
    await page.evaluate(() => document.documentElement.scrollHeight),
    MAX_SHOT_HEIGHT,
  );
  await page.screenshot({
    path: path.join(shotsDir, `${name}.png`),
    fullPage: true,
    clip: { x: 0, y: 0, width: VIEWPORT.width, height },
  });
}

async function tab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

async function status(page: Page, label: string): Promise<void> {
  await expect(page.locator('.page-header .status-pill').first()).toHaveText(label);
}

test.describe.configure({ mode: 'default' });
test.use({ viewport: VIEWPORT });

test.describe('Training manual', () => {
  test('1. Signing in', async ({ browser }) => {
    const context = await browser.newContext({ viewport: VIEWPORT });
    const page = await context.newPage();
    try {
      await open(page, '/login');
      await shot(page, '01-sign-in-empty');
      const admin = SESSIONS.wardAdmin;
      await page.locator('#unit-code').fill(admin.unitCode ?? '');
      await page.locator('#username').fill(admin.username);
      await page.locator('#password').fill(admin.password);
      await shot(page, '02-sign-in-filled');
      await signInThroughForm(page, admin);
      await heading(page, 'Welcome');
      await shot(page, '03-home-after-sign-in');

      const guest = await context.browser()?.newContext({ viewport: VIEWPORT });
      const guestPage = await guest?.newPage();
      if (guestPage) {
        await open(guestPage, '/forgot-password');
        await shot(guestPage, '04-forgot-password');
        await guest?.close();
      }
    } finally {
      await context.close();
    }
  });

  test.describe('as the ward administrator', () => {
    test.use(as('wardAdmin'));

    test('2. Finding your way around', async ({ page }) => {
      await open(page, '/');
      await heading(page, 'Welcome');
      await expect(page.getByRole('link', { name: 'Campaigns' }).first()).toBeVisible();
      await shot(page, '05-home');
      await open(page, '/settings/account');
      await shot(page, '06-account');
      await open(page, '/settings/security');
      await shot(page, '07-security');
    });

    test('3. People and households', async ({ page }) => {
      await open(page, '/directory');
      await shot(page, '08-people-list');

      await open(page, '/directory/people/new');
      const last = 'Trainee';
      await page.locator('#first-name').fill('Marigold');
      await page.locator('#last-name').fill(last);
      await page.locator('#preferred-name').fill(`Mari ${last}`);
      await page.getByLabel('Gender').selectOption('Female');
      await page.getByLabel('Date of birth (optional)').fill('1985-03-14');
      await shot(page, '09-add-person');
      await page.getByRole('button', { name: 'Save' }).click();
      await heading(page, `Mari ${last}`);
      await shot(page, '10-person-profile');
      await tab(page, 'Contact & consent');
      await shot(page, '11-person-contact-consent');
      await tab(page, 'Household');
      await shot(page, '12-person-household');

      await open(page, '/directory/households');
      await shot(page, '13-households');
    });

    test('4. Audiences and destinations', async ({ page, ward }) => {
      await open(page, '/audiences');
      await shot(page, '14-audiences-list');
      await open(page, '/audiences/new');
      const name = 'Fictional Ward Choir';
      await page.locator('#audience-name').fill(name);
      await page.locator('#audience-description').fill('Fictional choir members.');
      await shot(page, '15-new-audience');
      await page.getByRole('button', { name: 'Save' }).click();
      await heading(page, name);
      await open(page, `/audiences/${ward.audiences.newsletter}`);
      await shot(page, '16-audience-detail');
      await open(page, '/audiences/destinations');
      await shot(page, '17-destinations');
    });

    test('6. Bulletins', async ({ page, ward }) => {
      await open(page, '/bulletins');
      await heading(page, 'Bulletins');
      await shot(page, '26-bulletins-list');
      await open(page, `/bulletins/${ward.bulletins.draft}`);
      await shot(page, '27-bulletin-editor');
      await open(page, `/bulletins/${ward.bulletins.published}`);
      await shot(page, '28-bulletin-published');
      await open(page, `/${unitByKey('ward').publicSlug}`);
      await shot(page, '29-public-ward-page');
    });

    test('7. Running your unit', async ({ page }) => {
      await open(page, '/admin/users');
      await shot(page, '30-admin-users');
      await open(page, '/admin/ward-code');
      await shot(page, '31-admin-unit-code');
      await open(page, '/admin/organizations');
      await shot(page, '32-admin-organizations');
      await open(page, '/admin/provider-credentials');
      await shot(page, '33-admin-sending-accounts');
      await open(page, '/admin/facebook-page');
      await shot(page, '34-admin-facebook-page');
      await open(page, '/admin/audit');
      await shot(page, '35-admin-audit-log');
    });
  });

  test('5. Sending a message: write, submit, approve, send', async ({ browser, api, ward }) => {
    test.setTimeout(180_000);
    const contributor = await browser.newContext({ ...as('contributor'), viewport: VIEWPORT });
    const coordinator = await browser.newContext({ ...as('coordinator'), viewport: VIEWPORT });
    try {
      const writer = await contributor.newPage();
      await open(writer, '/campaigns');
      await shot(writer, '18-campaigns-list');

      const name = 'Fictional Ward Social';
      await open(writer, '/campaigns/new');
      await writer.locator('#campaign-name').fill(name);
      await writer
        .locator('#campaign-base-message')
        .fill('Fictional ward social this Friday at 7pm in the cultural hall. Bring a dessert.');
      await shot(writer, '19-new-campaign');
      await writer.getByRole('button', { name: 'Create draft' }).click();
      await heading(writer, name);
      await status(writer, 'Draft');
      const campaignId = new URL(writer.url()).pathname.split('/').pop() ?? '';

      // The audience picker is covered step by step in campaigns.spec.ts; here the
      // newsletter audience is attached directly so the walkthrough stays short.
      const attached = await (
        await api('contributor')
      ).post(`/campaigns/${campaignId}/audiences`, {
        data: { audienceGroupId: ward.audiences.newsletter },
      });
      expect(attached.status(), await attached.text()).toBe(201);
      await reload(writer);
      await tab(writer, 'Setup');
      await expect(writer.getByRole('heading', { name: 'Audiences (1)' })).toBeVisible();
      await shot(writer, '20-campaign-setup');
      await tab(writer, 'Content');
      await shot(writer, '21-campaign-content');
      await tab(writer, 'Review');
      await writer.getByRole('button', { name: 'Load preview' }).click();
      await writer.getByRole('button', { name: 'Check readiness' }).click();
      await expect(writer.getByText('Aaron Abernathy').first()).toBeVisible();
      await shot(writer, '22-campaign-review');
      await tab(writer, 'Approve & send');
      await expect(writer.getByRole('button', { name: 'Submit for approval' })).toBeVisible();
      await shot(writer, '22b-campaign-ready-to-submit');
      await writer.getByRole('button', { name: 'Submit for approval' }).click();
      await status(writer, 'Waiting for approval');
      await shot(writer, '23-campaign-submitted');

      const approver = await coordinator.newPage();
      await open(approver, '/');
      const pending = approver.getByRole('region', { name: 'Pending approvals' });
      await expect(pending.getByRole('link', { name })).toBeVisible();
      await shot(approver, '24-approver-home');
      await pending.getByRole('link', { name }).click();
      await tab(approver, 'Approve & send');
      await approver.locator('#approval-comment').fill('Fictional: looks good.');
      await approver.getByRole('button', { name: 'Approve' }).click();
      await status(approver, 'Approved');
      await approver.getByRole('button', { name: 'Send now' }).click();
      await status(approver, 'Sent');
      await expect(
        approver.getByRole('button', { name: /Batch .* — (Completed|Partial failure)/ }),
      ).toBeVisible();
      await shot(approver, '25-campaign-sent-results');
    } finally {
      await contributor.close();
      await coordinator.close();
    }
  });
});
