import type { Page } from '@playwright/test';
import { CAMPAIGNS, UNITS } from '../../mock-ward/fixture';
import { expect, heading, open, primaryNav, test } from './helpers/fixtures';
import { SESSIONS, as, type SessionKey } from './helpers/sessions';

/** What each sidebar destination should show once clicked. */
const DESTINATION_HEADINGS: Record<string, { name: string | RegExp; level?: number }> = {
  Account: { name: 'Account' },
  Security: { name: 'Security' },
  Home: { name: /^Welcome/ },
  People: { name: 'Directory' },
  Households: { name: 'Households' },
  Campaigns: { name: 'Campaigns' },
  Bulletins: { name: 'Bulletins' },
  Audiences: { name: 'Audiences' },
  Destinations: { name: 'Communication destinations' },
  Users: { name: 'User management' },
  Units: { name: /^Units/, level: 2 },
  'Ward code': { name: 'Ward code' },
  'Stake code': { name: 'Ward code' },
  'District code': { name: 'Ward code' },
  Organizations: { name: 'Organizations', level: 2 },
  Providers: { name: 'Provider credentials' },
  'Facebook Page': { name: 'Facebook Page' },
  'Audit log': { name: 'Audit log' },
};

const MEMBER_SECTIONS = [
  'Account',
  'Security',
  'Home',
  'People',
  'Households',
  'Campaigns',
  'Bulletins',
  'Audiences',
  'Destinations',
];

/** The exact sidebar every role should see, in order. Administration items come last. */
const EXPECTED_SIDEBAR: Record<SessionKey, string[]> = {
  superadmin: ['Account', 'Security', 'Home', 'Units'],
  districtAdmin: [
    ...MEMBER_SECTIONS,
    'Users',
    'Units',
    'District code',
    'Organizations',
    'Providers',
    'Facebook Page',
    'Audit log',
  ],
  stakeAdmin: [
    ...MEMBER_SECTIONS,
    'Users',
    'Units',
    'Stake code',
    'Organizations',
    'Providers',
    'Facebook Page',
    'Audit log',
  ],
  wardAdmin: [
    ...MEMBER_SECTIONS,
    'Users',
    'Ward code',
    'Organizations',
    'Providers',
    'Facebook Page',
    'Audit log',
  ],
  coordinator: [...MEMBER_SECTIONS, 'Providers', 'Facebook Page', 'Audit log'],
  contributor: MEMBER_SECTIONS,
  // Viewer holds only directory.read, so messaging sections should not be offered.
  viewer: ['Account', 'Security', 'Home', 'People', 'Households'],
  otherWardAdmin: [
    ...MEMBER_SECTIONS,
    'Users',
    'Ward code',
    'Organizations',
    'Providers',
    'Facebook Page',
    'Audit log',
  ],
};

/** Confirmed app bugs, kept visible as expected failures until fixed. */
const KNOWN_NAV_BUGS: Partial<Record<SessionKey, string>> = {
  viewer:
    'BUG: the sidebar offers Campaigns, Bulletins, Audiences and Destinations to a Viewer; each page then shows "Missing required permission".',
};

async function sidebarLabels(page: Page): Promise<string[]> {
  const nav = primaryNav(page);
  await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
  return (await nav.locator('nav a').allTextContents()).map((text) => text.trim());
}

for (const role of Object.keys(EXPECTED_SIDEBAR) as SessionKey[]) {
  test.describe(`Sidebar as ${role}`, () => {
    test.use(as(role));

    test('shows exactly the sections this role may use', async ({ page }) => {
      test.fail(Boolean(KNOWN_NAV_BUGS[role]), KNOWN_NAV_BUGS[role]);
      await open(page, '/');
      await expect.poll(() => sidebarLabels(page)).toEqual(EXPECTED_SIDEBAR[role]);
      await expect(primaryNav(page).getByText(SESSIONS[role].displayName)).toBeVisible();
    });

    test('every sidebar link opens its page without a permission error', async ({ page }) => {
      test.fail(Boolean(KNOWN_NAV_BUGS[role]), KNOWN_NAV_BUGS[role]);
      const refused: string[] = [];
      page.on('response', (response) => {
        if (response.status() === 403)
          refused.push(`${new URL(page.url()).pathname} → ${new URL(response.url()).pathname}`);
      });
      await open(page, '/');
      for (const label of await sidebarLabels(page)) {
        const link = primaryNav(page)
          .locator('nav')
          .getByRole('link', { name: label, exact: true });
        await link.click();
        const expected = DESTINATION_HEADINGS[label];
        if (!expected) throw new Error(`No expected heading for ${label}`);
        await heading(page, expected.name, expected.level ?? 1);
        await expect(link).toHaveAttribute('aria-current', 'page');
        await page.waitForLoadState('networkidle');
      }
      expect(
        refused,
        `The API refused requests made by pages in this role's sidebar:\n${refused.join('\n')}`,
      ).toEqual([]);
      await expect(page.getByText(/Missing required permission|Forbidden/)).toHaveCount(0);
    });
  });
}

test.describe('Shared navigation', () => {
  test.use(as('wardAdmin'));

  test('the brand link returns home from any page', async ({ page }) => {
    await open(page, '/audiences/destinations');
    await primaryNav(page).getByRole('link', { name: 'Ward Comms' }).click();
    await heading(page, /^Welcome/);
  });

  test('home quick-action cards open their sections', async ({ page }) => {
    for (const [card, target] of [
      ['Directory', 'Directory'],
      ['Campaigns', 'Campaigns'],
      ['Audiences', 'Audiences'],
      ['New campaign', 'Create campaign'],
    ] as const) {
      await open(page, '/');
      await page
        .getByRole('region', { name: 'Quick actions' })
        .getByRole('link', { name: new RegExp(`^${card}`) })
        .click();
      await heading(page, target);
    }
  });

  test('home lists campaigns waiting for approval and recent campaigns', async ({ page }) => {
    await open(page, '/');
    const pending = page.getByRole('region', { name: 'Pending approvals' });
    await expect(pending.getByRole('link', { name: CAMPAIGNS.pending.name })).toBeVisible();
    await pending.getByRole('link', { name: CAMPAIGNS.pending.name }).click();
    await heading(page, CAMPAIGNS.pending.name);

    await open(page, '/');
    const recent = page.getByRole('region', { name: 'Recent campaigns' });
    await expect(recent.getByRole('listitem')).toHaveCount(5);
    await recent.getByRole('link', { name: 'View all' }).click();
    await heading(page, 'Campaigns');
  });

  test('directory sub-navigation switches between people and households', async ({ page }) => {
    await open(page, '/directory');
    const subnav = page.getByRole('navigation', { name: 'Section' });
    await subnav.getByRole('link', { name: 'Households' }).click();
    await heading(page, 'Households');
    await expect(subnav.getByRole('link', { name: 'Households' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await subnav.getByRole('link', { name: 'People' }).click();
    await heading(page, 'Directory');
    await page.getByRole('link', { name: 'Households' }).last().click();
    await heading(page, 'Households');
  });

  test('audience sub-navigation switches between groups and destinations', async ({ page }) => {
    await open(page, '/audiences');
    const subnav = page.getByRole('navigation', { name: 'Section' });
    await subnav.getByRole('link', { name: 'Destinations' }).click();
    await heading(page, 'Communication destinations');
    await page.getByRole('link', { name: '← Back to audiences' }).click();
    await heading(page, 'Audiences');
    await subnav.getByRole('link', { name: 'Groups' }).click();
    await heading(page, 'Audiences');
  });

  test('the administration sub-navigation matches the sidebar', async ({ page }) => {
    await open(page, '/admin');
    await heading(page, 'Administration');
    const subnav = page.getByRole('navigation', { name: 'Section' });
    await expect(subnav.getByRole('link')).toHaveText([
      'Users',
      'Ward code',
      'Organizations',
      'Providers',
      'Facebook Page',
      'Audit log',
    ]);
    for (const label of [
      'Users',
      'Ward code',
      'Organizations',
      'Providers',
      'Facebook Page',
      'Audit log',
    ]) {
      await subnav.getByRole('link', { name: label, exact: true }).click();
      const expected = DESTINATION_HEADINGS[label];
      await heading(page, expected?.name ?? label, expected?.level ?? 1);
    }
  });

  test('breadcrumbs lead back to their section', async ({ page, ward }) => {
    await open(page, `/campaigns/${ward.campaigns.draft}`);
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByText(CAMPAIGNS.draft.name)).toHaveAttribute('aria-current', 'page');
    await crumbs.getByRole('link', { name: 'Campaigns' }).click();
    await heading(page, 'Campaigns');

    await open(page, `/directory/people/${ward.people.aaron}`);
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Directory' })
      .click();
    await heading(page, 'Directory');

    await open(page, `/audiences/${ward.audiences.adults}`);
    await page
      .getByRole('navigation', { name: 'Breadcrumb' })
      .getByRole('link', { name: 'Audiences' })
      .click();
    await heading(page, 'Audiences');
  });
});

test.describe('Mobile navigation', () => {
  test.use({ ...as('viewer'), viewport: { width: 390, height: 844 } });

  test('the menu button opens the sidebar, and choosing a page closes it', async ({ page }) => {
    await open(page, '/');
    // Wait for the layout's session refresh, which re-renders the header.
    await expect(primaryNav(page).getByText(SESSIONS.viewer.displayName)).toBeAttached();
    const menu = page.getByRole('button', { name: 'Open navigation' });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(async () => {
      await menu.click();
      await expect(menu).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
    }).toPass();
    await primaryNav(page).getByRole('link', { name: 'Campaigns' }).click();
    await heading(page, 'Campaigns');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await menu.click();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('button', { name: 'Close navigation' })
      .click({ position: { x: 370, y: 400 } });
    await expect(menu).toHaveAttribute('aria-expanded', 'false');

    await page.locator('.mobile-header').getByRole('link', { name: 'Ward Comms' }).click();
    await heading(page, /^Welcome/);
  });
});

test.describe('Platform home', () => {
  test.use(as('superadmin'));

  test('lists every tenant and links to unit management', async ({ page }) => {
    await open(page, '/');
    const tenants = page.getByRole('region', { name: 'Tenants' });
    for (const unit of UNITS) {
      await expect(tenants.getByRole('link', { name: unit.name })).toBeVisible();
      await expect(tenants.getByText(`/${unit.publicSlug}`)).toBeVisible();
    }
    await tenants.getByRole('link', { name: 'Manage wards' }).click();
    await expect(page.locator('.wards__header h2')).toHaveText('Units');

    await open(page, '/');
    await page
      .getByRole('region', { name: 'Platform actions' })
      .getByRole('link', { name: /^Wards/ })
      .click();
    await expect(page.locator('.wards__header h2')).toHaveText('Units');
  });
});
