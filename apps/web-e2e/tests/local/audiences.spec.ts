import type { APIRequestContext, Page } from '@playwright/test';
import { AUDIENCES, DESTINATIONS, FACEBOOK_PAGE } from '../../mock-ward/fixture';
import { acceptNextDialog, expect, fill, heading, open, test, unique } from './helpers/fixtures';
import { as } from './helpers/sessions';

/** Clicks "Save rules" and waits for the server to store them, since Preview and Apply read the stored rules. */
async function saveRules(page: Page): Promise<void> {
  const saved = page.waitForResponse(
    (response) => response.url().includes('/rules') && response.request().method() === 'PUT',
  );
  await page
    .getByRole('region', { name: 'Membership rules' })
    .getByRole('button', { name: 'Save rules' })
    .click();
  expect((await saved).ok()).toBe(true);
}

async function createAudience(api: APIRequestContext): Promise<{ id: string; name: string }> {
  const name = `Fictional Audience ${unique()}`;
  const response = await api.post('/audiences', {
    data: { name, description: 'Created by a test.' },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, name };
}

test.describe('Audiences as ward admin', () => {
  test.use(as('wardAdmin'));

  test('lists active audiences with member and destination counts', async ({ page }) => {
    await open(page, '/audiences');
    await heading(page, 'Audiences');
    for (const key of [
      'adults',
      'youth',
      'sisters',
      'newsletter',
      'textAlerts',
      'empty',
    ] as const) {
      await expect(
        page.getByRole('link', { name: AUDIENCES[key].name, exact: true }),
      ).toBeVisible();
    }
    const youth = page.locator('ul.results li', { hasText: AUDIENCES.youth.name });
    await expect(youth).toContainText('2 members');
    await expect(youth).toContainText('1 destinations');
  });

  test('archived audiences stay hidden until “Include archived” is ticked', async ({ page }) => {
    await open(page, '/audiences');
    await expect(page.getByRole('link', { name: AUDIENCES.adults.name })).toBeVisible();
    await expect(page.getByRole('link', { name: AUDIENCES.archived.name })).toHaveCount(0);
  });

  test('search and the include-archived filter', async ({ page }) => {
    await open(page, '/audiences');
    await fill(page, '#audience-query', 'Relief');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('ul.results li')).toHaveCount(1);
    await fill(page, '#audience-query', 'Old Committee');
    await page.getByLabel('Include archived').check();
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(
      page.locator('ul.results li', { hasText: AUDIENCES.archived.name }).getByText('Archived'),
    ).toBeVisible();
    await fill(page, '#audience-query', 'Nothing Fictional Matches');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No audiences yet')).toBeVisible();
  });

  test('header buttons open create and destinations', async ({ page }) => {
    await open(page, '/audiences');
    await page.getByRole('link', { name: 'Create audience' }).first().click();
    await heading(page, 'Create audience');
    await open(page, '/audiences');
    await page.locator('.page-header').getByRole('link', { name: 'Destinations' }).click();
    await heading(page, 'Communication destinations');
  });

  test('create an audience: a blank name is rejected, a named one opens', async ({ page }) => {
    await open(page, '/audiences/new');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    const name = `Fictional Choir ${unique()}`;
    await fill(page, '#audience-name', name);
    await page.locator('#audience-description').fill('Fictional choir members.');
    await page.getByRole('button', { name: 'Save' }).click();
    await heading(page, name);
    await expect(page.locator('#edit-description')).toHaveValue('Fictional choir members.');
    await expect(page.getByRole('heading', { name: 'Members (0)' })).toBeVisible();
  });

  test('rename, add and remove a member, link and unlink a destination', async ({ page, api }) => {
    const audience = await createAudience(await api('wardAdmin'));
    await open(page, `/audiences/${audience.id}`);
    await fill(page, '#edit-name', `${audience.name} Renamed`);
    await page
      .getByRole('region', { name: 'Audience info' })
      .getByRole('button', { name: 'Save' })
      .click();
    await heading(page, `${audience.name} Renamed`);

    const members = page.getByRole('region', { name: /Members/ });
    await expect(members.getByRole('button', { name: 'Add member' })).toBeDisabled();
    await fill(page, '#new-member-picker', 'Evander');
    await members.getByRole('option', { name: /Evander Brightwater/ }).click();
    await members.getByRole('button', { name: 'Add member' }).click();
    await expect(page.getByRole('heading', { name: 'Members (1)' })).toBeVisible();
    const row = members.locator('li', { hasText: 'Evander Brightwater' });
    await expect(row.getByText('Manual')).toBeVisible();
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(page.getByRole('heading', { name: 'Members (0)' })).toBeVisible();

    const destinations = page.getByRole('region', { name: /Destinations/ });
    await destinations
      .getByLabel('Destination')
      .selectOption({ label: `${DESTINATIONS[1]?.name} (Sms)` });
    await destinations.getByRole('button', { name: 'Link destination' }).click();
    await expect(page.getByRole('heading', { name: 'Destinations (1)' })).toBeVisible();
    await destinations
      .locator('li', { hasText: DESTINATIONS[1]?.name ?? '' })
      .getByRole('button', { name: 'Unlink' })
      .click();
    await expect(page.getByRole('heading', { name: 'Destinations (0)' })).toBeVisible();
  });

  test('a minor added to an audience is labelled, and the link opens their record', async ({
    page,
    ward,
  }) => {
    await open(page, `/audiences/${ward.audiences.youth}`);
    const row = page
      .getByRole('region', { name: /Members/ })
      .locator('li', { hasText: 'Cora Abernathy' });
    await expect(row.getByText('Minor')).toBeVisible();
    await row.getByRole('link', { name: 'Cora Abernathy' }).click();
    await heading(page, 'Cora Abernathy');
  });

  test('rules: preview and apply age and gender rules', async ({ page, api }) => {
    const audience = await createAudience(await api('wardAdmin'));
    await open(page, `/audiences/${audience.id}`);
    const rules = page.getByRole('region', { name: 'Membership rules' });
    await expect(rules.getByRole('button', { name: 'Preview matches' })).toBeDisabled();
    await rules.getByLabel('Mode').selectOption('Rules');
    await fill(page, '#rule-age-min', '60');
    await rules.getByLabel('Male', { exact: true }).check();
    await saveRules(page);
    await rules.getByRole('button', { name: 'Preview matches' }).click();
    await expect(rules.getByText('Preview: 1 match(es).')).toBeVisible();
    await expect(rules.getByText('Evander Brightwater')).toBeVisible();

    await rules.getByRole('button', { name: 'Apply rules' }).click();
    await expect(rules.getByText('Applied: 1 added, 0 rule members removed.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members (1)' })).toBeVisible();
    await expect(
      page
        .getByRole('region', { name: /Members/ })
        .locator('li', { hasText: 'Evander' })
        .getByText('Rule'),
    ).toBeVisible();

    // Widening the rule adds people; switching back to manual keeps the page usable.
    await rules.getByLabel('Female').check();
    await saveRules(page);
    await rules.getByRole('button', { name: 'Apply rules' }).click();
    await expect(rules.getByText('Applied: 1 added, 0 rule members removed.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Members (2)' })).toBeVisible();

    await rules.getByLabel('Mode').selectOption('Manual');
    await saveRules(page);
    await expect(rules.getByRole('button', { name: 'Apply rules' })).toBeDisabled();
  });

  test('the seeded adults rule matches every adult and no minors', async ({ page, ward }) => {
    await open(page, `/audiences/${ward.audiences.adults}`);
    const members = page.getByRole('region', { name: /Members/ });
    for (const name of [
      'Aaron Abernathy',
      'Bea Abernathy',
      'Evander Brightwater',
      'Fiona Brightwater',
      'Gideon Castellan',
      'Harriet Delacroix',
    ]) {
      await expect(members.getByRole('link', { name })).toBeVisible();
    }
    await expect(members.getByRole('link', { name: 'Cora Abernathy' })).toHaveCount(0);
    await expect(members.getByRole('link', { name: 'Juniper Ellison' })).toHaveCount(0);
  });

  test('archive and restore an audience', async ({ page, api }) => {
    const audience = await createAudience(await api('wardAdmin'));
    await open(page, `/audiences/${audience.id}`);
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.locator('.status-pill', { hasText: 'Archived' })).toBeVisible();
    await page.getByRole('button', { name: 'Restore' }).click();
    await expect(page.locator('.status-pill', { hasText: 'Archived' })).toHaveCount(0);
  });

  test('delete permanently is refused while the audience has members, and works once it is empty', async ({
    page,
    api,
    ward,
  }) => {
    const admin = await api('wardAdmin');
    const audience = await createAudience(admin);
    await admin.post(`/audiences/${audience.id}/members`, {
      data: { personId: ward.people.gideon },
    });
    await open(page, `/audiences/${audience.id}`);
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await heading(page, audience.name);

    await page
      .getByRole('region', { name: /Members/ })
      .locator('li', { hasText: 'Gideon' })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(page.getByRole('heading', { name: 'Members (0)' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page).toHaveURL(/\/audiences$/);
    await expect(page.getByRole('link', { name: audience.name })).toHaveCount(0);
  });

  test('“Delete permanently” asks for confirmation first', async ({ page, api }) => {
    test.fail(
      true,
      'UX gap: "Delete permanently" deletes immediately with no confirmation (bulletin and organization deletes do confirm).',
    );
    const audience = await createAudience(await api('wardAdmin'));
    await open(page, `/audiences/${audience.id}`);
    let asked = false;
    page.once('dialog', (dialog) => {
      asked = true;
      void dialog.dismiss();
    });
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await page.waitForTimeout(1_000);
    expect(asked).toBe(true);
  });

  test('an audience from another ward cannot be opened', async ({ page, ward, api }) => {
    expect(
      (await (await api('wardAdmin')).get(`/audiences/${ward.otherWard.audienceId}`)).status(),
    ).toBe(404);
    await open(page, `/audiences/${ward.otherWard.audienceId}`);
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Destinations as ward admin', () => {
  test.use(as('wardAdmin'));

  test('lists destinations, including the connected Facebook Page and archived ones', async ({
    page,
  }) => {
    await open(page, '/audiences/destinations');
    await expect(page.getByText(`${DESTINATIONS[0]?.name} (Email)`)).toBeVisible();
    await expect(page.getByText(`${DESTINATIONS[1]?.name} (Sms)`)).toBeVisible();
    await expect(page.getByText(`${FACEBOOK_PAGE.pageName} (FacebookPage)`)).toBeVisible();
    const archived = page.locator('li', { hasText: DESTINATIONS[2]?.name ?? '' });
    await expect(archived.getByText('Archived')).toBeVisible();
    await expect(archived.getByRole('button', { name: 'Archive' })).toHaveCount(0);
  });

  for (const [channel, label] of [
    ['Email', 'Email'],
    ['Sms', 'SMS'],
    ['FacebookPage', 'Facebook Page'],
  ] as const) {
    test(`add a ${label} destination and archive it`, async ({ page }) => {
      const name = `Fictional ${label} ${unique()}`;
      await open(page, '/audiences/destinations');
      await fill(page, '#destination-name', name);
      await page.getByLabel('Channel').selectOption(channel);
      await fill(page, '#destination-reference', `fictional-ref-${unique()}`);
      await page.getByRole('button', { name: 'Add destination' }).click();
      const row = page.locator('li', { hasText: `${name} (${channel})` });
      await expect(row).toBeVisible();
      await row.getByRole('button', { name: 'Archive' }).click();
      await expect(row.getByText('Archived')).toBeVisible();
    });
  }

  test('a destination needs a name', async ({ page }) => {
    await open(page, '/audiences/destinations');
    await page.getByRole('button', { name: 'Add destination' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});

test.describe('Audiences permissions', () => {
  test.use(as('contributor'));

  test('a contributor can read audiences but not change them', async ({ page, ward, api }) => {
    await open(page, `/audiences/${ward.audiences.adults}`);
    await heading(page, AUDIENCES.adults.name);
    await expect(page.getByText('You can view this audience but your role can’t change it.')).toBeVisible();
    await expect(page.locator('#edit-name')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Delete permanently' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0);
    await open(page, '/audiences');
    await expect(page.getByRole('link', { name: 'Create audience' })).toHaveCount(0);
    await open(page, '/audiences/destinations');
    await expect(page.getByRole('button', { name: 'Add destination' })).toHaveCount(0);

    const contributor = await api('contributor');
    expect((await contributor.post('/audiences', { data: { name: 'Blocked' } })).status()).toBe(
      403,
    );
    expect(
      (
        await contributor.post('/communication-destinations', {
          data: { name: 'Blocked', channel: 'Email' },
        })
      ).status(),
    ).toBe(403);
    expect((await contributor.delete(`/audiences/${ward.audiences.empty}`)).status()).toBe(403);
  });
});

test.describe('Audiences as coordinator', () => {
  test.use(as('coordinator'));

  test('a coordinator can delete an audience with no members or destinations', async ({
    page,
    api,
  }) => {
    const audience = await createAudience(await api('coordinator'));
    acceptNextDialog(page);
    await open(page, `/audiences/${audience.id}`);
    await page.getByRole('button', { name: 'Delete permanently' }).click();
    await expect(page).toHaveURL(/\/audiences$/);
    await expect(page.getByRole('link', { name: audience.name })).toHaveCount(0);
  });
});
