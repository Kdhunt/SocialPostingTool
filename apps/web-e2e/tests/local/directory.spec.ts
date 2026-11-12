import type { APIRequestContext } from '@playwright/test';
import { HOUSEHOLDS, PEOPLE, personByKey, personDisplayName } from '../../mock-ward/fixture';
import { expect, fill, heading, open, test, unique } from './helpers/fixtures';
import { as } from './helpers/sessions';

async function createPerson(
  api: APIRequestContext,
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; lastName: string }> {
  const lastName = `Testperson${unique()}`;
  const response = await api.post('/directory/people', {
    data: {
      firstName: 'Fictional',
      lastName,
      gender: 'NotSpecified',
      dateOfBirth: '1990-05-05',
      ...overrides,
    },
  });
  expect(response.status(), await response.text()).toBe(201);
  return { id: ((await response.json()) as { id: string }).id, lastName };
}

test.describe('Directory as ward admin', () => {
  test.use(as('wardAdmin'));

  test('lists active members with household, minor and inactive badges', async ({ page }) => {
    await open(page, '/directory');
    await heading(page, 'Directory');
    const results = page.locator('ul.results');
    for (const person of PEOPLE.filter(
      (candidate) => !candidate.inactive && candidate.key !== 'aspenOnly',
    )) {
      await expect(
        results.getByRole('link', { name: personDisplayName(person), exact: true }),
      ).toBeVisible();
    }
    await expect(results.getByRole('link', { name: 'Zebulon Aspenfield' })).toHaveCount(0);

    const cora = results.locator('li', { has: page.getByRole('link', { name: 'Cora Abernathy' }) });
    await expect(cora.getByText('Minor')).toBeVisible();
    await expect(cora.getByText(HOUSEHOLDS[0].name)).toBeVisible();
    const aaron = results.locator('li', {
      has: page.getByRole('link', { name: 'Aaron Abernathy' }),
    });
    await expect(aaron.getByText('Minor')).toHaveCount(0);
  });

  test('search by name, include inactive members, and the empty state', async ({ page }) => {
    await open(page, '/directory');
    await fill(page, '#directory-query', 'Brightwater');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('ul.results li')).toHaveCount(2);

    await fill(page, '#directory-query', 'Kellan');
    await page.getByLabel('Include inactive members').check();
    await page.getByRole('button', { name: 'Search' }).click();
    const kellan = page.locator('ul.results li', { hasText: 'Kellan Ellison' });
    await expect(kellan.getByText('Inactive')).toBeVisible();

    await fill(page, '#directory-query', 'Nobody Fictional Zzz');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No people found')).toBeVisible();
    await page.getByRole('link', { name: 'Add person' }).last().click();
    await heading(page, 'Add person');
  });

  test('inactive members stay hidden until “Include inactive members” is ticked', async ({
    page,
  }) => {
    await open(page, '/directory');
    await expect(page.locator('ul.results')).toBeVisible();
    await expect(
      page.locator('ul.results').getByRole('link', { name: 'Kellan Ellison' }),
    ).toHaveCount(0);
    await fill(page, '#directory-query', 'Kellan');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No people found')).toBeVisible();
  });

  test('add person: a missing name is rejected, a complete form opens the new record', async ({
    page,
  }) => {
    await open(page, '/directory/people/new');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    const last = `Newperson${unique()}`;
    await fill(page, '#first-name', 'Fictional');
    await fill(page, '#last-name', last);
    await fill(page, '#preferred-name', `Fic ${last}`);
    await page.getByLabel('Gender').selectOption('Female');
    await page.getByLabel('Date of birth (optional)').fill('1985-03-14');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page).toHaveURL(/\/directory\/people\/[0-9a-f-]+$/);
    await heading(page, `Fic ${last}`);
    await expect(page.locator('#edit-dob')).toHaveValue('1985-03-14');
    await expect(page.locator('#edit-gender')).toHaveValue('Female');
  });

  test('profile tab: save edits, then mark inactive and active again', async ({ page, api }) => {
    const person = await createPerson(await api('wardAdmin'));
    await open(page, `/directory/people/${person.id}`);
    await page.getByRole('tab', { name: 'Profile' }).click();
    await fill(page, '#edit-preferred-name', `Renamed ${person.lastName}`);
    await page.getByRole('button', { name: 'Save profile' }).click();
    await heading(page, `Renamed ${person.lastName}`);

    await page.getByRole('button', { name: 'Mark inactive' }).click();
    await expect(page.locator('.status-pill', { hasText: 'Inactive' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark active' }).click();
    await expect(page.locator('.status-pill', { hasText: 'Inactive' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mark inactive' })).toBeVisible();
  });

  test('contact tab: add email and phone, grant and deny consent, remove a method', async ({
    page,
    api,
  }) => {
    const person = await createPerson(await api('wardAdmin'));
    await open(page, `/directory/people/${person.id}`);
    await page.getByRole('tab', { name: 'Contact & consent' }).click();
    const panel = page.getByRole('tabpanel', { name: /Contact & consent/ });

    await fill(page, '#contact-value', `${person.lastName.toLowerCase()}@example.test`);
    await page.getByRole('button', { name: 'Add contact method' }).click();
    const emailRow = panel.locator('li', {
      hasText: `${person.lastName.toLowerCase()}@example.test`,
    });
    await expect(emailRow.getByText('Consent: Not recorded')).toBeVisible();

    await page.getByLabel('Type').selectOption('Phone');
    await fill(page, '#contact-value', '(801) 555-0177');
    await page.getByRole('button', { name: 'Add contact method' }).click();
    const phoneRow = panel.locator('li', { hasText: '555' });
    await expect(phoneRow).toContainText('Phone');

    await emailRow.getByRole('button', { name: 'Grant' }).click();
    await expect(emailRow.getByText('Consent: Granted')).toBeVisible();
    await emailRow.getByRole('button', { name: 'Deny' }).click();
    await expect(emailRow.getByText('Consent: Denied')).toBeVisible();

    await phoneRow.getByRole('button', { name: 'Remove' }).click();
    await expect
      .poll(async () => {
        const detail = (await (
          await api('wardAdmin')
        )
          .get(`/directory/people/${person.id}`)
          .then((r) => r.json())) as {
          contactMethods: Array<{ type: string; archivedAt: string | null }>;
        };
        return detail.contactMethods.find((method) => method.type === 'Phone')?.archivedAt ?? null;
      })
      .not.toBeNull();
  });

  test('a removed contact method disappears from the person’s page', async ({ page, api }) => {
    const person = await createPerson(await api('wardAdmin'));
    await (
      await api('wardAdmin')
    ).post(`/directory/people/${person.id}/contact-methods`, {
      data: { type: 'Phone', value: '(801) 555-0178' },
    });
    await open(page, `/directory/people/${person.id}`);
    await page.getByRole('tab', { name: 'Contact & consent' }).click();
    const row = page
      .getByRole('tabpanel', { name: /Contact & consent/ })
      .locator('li', { hasText: '555-0178' });
    await row.getByRole('button', { name: 'Remove' }).click();
    await expect(row).toHaveCount(0);
  });

  test('contact tab rejects an invalid email address', async ({ page, api }) => {
    const person = await createPerson(await api('wardAdmin'));
    await open(page, `/directory/people/${person.id}`);
    await page.getByRole('tab', { name: 'Contact & consent' }).click();
    await fill(page, '#contact-value', 'not-an-email');
    await page.getByRole('button', { name: 'Add contact method' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('household tab: join a household with the picker, then end the membership', async ({
    page,
    api,
  }) => {
    const person = await createPerson(await api('wardAdmin'));
    await open(page, `/directory/people/${person.id}`);
    await page.getByRole('tab', { name: 'Household' }).click();
    const panel = page.getByRole('tabpanel', { name: /Household/ });
    await expect(panel.getByRole('button', { name: 'Add to household' })).toBeDisabled();
    await fill(page, '#household-picker', 'Castellan');
    await panel.getByRole('option', { name: 'Fictional Castellan Household' }).click();
    await expect(panel.getByText('Selected: Fictional Castellan Household')).toBeVisible();
    await panel.getByRole('button', { name: 'Add to household' }).click();
    const row = panel.locator('li', { hasText: 'Fictional Castellan Household' }).first();
    await expect(row.getByRole('button', { name: 'End membership' })).toBeVisible();

    await row.getByRole('button', { name: 'End membership' }).click();
    await expect(row.getByText('Ended')).toBeVisible();

    await row.getByRole('link', { name: 'Fictional Castellan Household' }).click();
    await heading(page, 'Fictional Castellan Household');
  });

  test('family tab: link a relative with the person search, then end the relationship', async ({
    page,
    api,
  }) => {
    const person = await createPerson(await api('wardAdmin'));
    await open(page, `/directory/people/${person.id}`);
    await page.getByRole('tab', { name: 'Family' }).click();
    const panel = page.getByRole('tabpanel', { name: /Family/ });
    await expect(panel.getByRole('button', { name: 'Add relationship' })).toBeDisabled();
    await fill(page, '#related-person-picker', 'Gideon');
    await panel.getByRole('option', { name: /Gideon Castellan/ }).click();
    await panel.getByLabel('Relationship').selectOption('Guardian');
    await panel.getByRole('button', { name: 'Add relationship' }).click();
    const row = panel.locator('li', { hasText: 'Gideon Castellan' });
    await expect(row).toContainText('Guardian of');

    await row.getByRole('link', { name: 'Gideon Castellan' }).click();
    await heading(page, 'Gideon Castellan');
    await page.getByRole('tab', { name: 'Family' }).click();
    // The inverse relationship is created automatically.
    await expect(
      page
        .getByRole('tabpanel', { name: /Family/ })
        .getByRole('link', { name: `Fictional ${person.lastName}` }),
    ).toBeVisible();

    await page.goBack();
    await page.getByRole('tab', { name: 'Family' }).click();
    await page
      .getByRole('tabpanel', { name: /Family/ })
      .locator('li', { hasText: 'Gideon Castellan' })
      .getByRole('button', { name: 'End relationship' })
      .click();
    await expect(
      page.getByRole('tabpanel', { name: /Family/ }).locator('li', { hasText: 'Gideon Castellan' }),
    ).toHaveCount(0);
  });

  test('a seeded family shows its relationships and household members', async ({ page, ward }) => {
    await open(page, `/directory/people/${ward.people.aaron}`);
    await page.getByRole('tab', { name: 'Family' }).click();
    const family = page.getByRole('tabpanel', { name: /Family/ });
    await expect(family.getByRole('link', { name: 'Bea Abernathy' })).toBeVisible();
    await expect(family.getByRole('link', { name: 'Cora Abernathy' })).toBeVisible();

    await open(page, `/directory/households/${ward.households.abernathy}`);
    await heading(page, 'Fictional Abernathy Family');
    const members = page.getByRole('region', { name: 'Members' });
    await expect(members.getByRole('listitem')).toHaveCount(4);
    await expect(
      members.locator('li', { hasText: 'Dashiell Abernathy' }).getByText('Minor'),
    ).toBeVisible();
    await expect(members.locator('li', { hasText: 'Aaron Abernathy' })).toContainText('(Head)');
    await members.getByRole('link', { name: 'Bea Abernathy' }).click();
    await heading(page, 'Bea Abernathy');
  });

  test('a ward admin can see a minor’s birth date and contact details', async ({ page, ward }) => {
    await open(page, `/directory/people/${ward.people.cora}`);
    await heading(page, 'Cora Abernathy');
    await expect(page.getByText('restricted for this record')).toHaveCount(0);
    await expect(page.locator('#edit-dob')).not.toHaveValue('');
    await page.getByRole('tab', { name: 'Contact & consent' }).click();
    await expect(page.getByText('cora.minor@example.test')).toBeVisible();
  });

  test('a record from another ward cannot be opened', async ({ page, ward, api }) => {
    const response = await (
      await api('wardAdmin')
    ).get(`/directory/people/${ward.otherWard.personId}`);
    expect(response.status()).toBe(404);
    await open(page, `/directory/people/${ward.otherWard.personId}`);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByText('Zebulon')).toHaveCount(0);
  });
});

test.describe('Households as ward admin', () => {
  test.use(as('wardAdmin'));

  test('lists every household with member counts and links', async ({ page }) => {
    await open(page, '/directory/households');
    await heading(page, 'Households');
    for (const household of HOUSEHOLDS) {
      await expect(page.getByRole('link', { name: household.name })).toBeVisible();
    }
    await expect(page.locator('li', { hasText: 'Fictional Abernathy Family' })).toContainText(
      '4 member(s)',
    );
    await page.getByRole('link', { name: 'Fictional Brightwater Family' }).click();
    await heading(page, 'Fictional Brightwater Family');
    await page.getByRole('link', { name: '← Back to households' }).click();
    await heading(page, 'Households');
    await page.getByRole('link', { name: 'Directory', exact: true }).last().click();
    await heading(page, 'Directory');
  });

  test('add a household, edit it and mark it inactive', async ({ page }) => {
    const name = `Fictional Household ${unique()}`;
    await open(page, '/directory/households');
    await page.getByRole('link', { name: 'Add household' }).click();
    await expect(page).toHaveURL(/\/directory\/households\/new$/);
    await open(page, '/directory/households/new');
    await heading(page, 'Add household');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toBeVisible();

    await fill(page, '#household-name', name);
    await fill(page, '#address-line1', '900 Fictional Street');
    await fill(page, '#city', 'Fictionville');
    await fill(page, '#state', 'UT');
    await fill(page, '#postal-code', '84003');
    await page.getByRole('button', { name: 'Save' }).click();
    await heading(page, name);
    await expect(
      page.getByText("No current members. Add members from a person's page."),
    ).toBeVisible();

    await fill(page, '#edit-name', `${name} Renamed`);
    await fill(page, '#edit-city', 'Newfictionville');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await heading(page, `${name} Renamed`);
    await expect(page.locator('#edit-city')).toHaveValue('Newfictionville');

    await page.getByRole('button', { name: 'Mark inactive' }).click();
    await expect(page.getByText('Inactive', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Mark inactive' })).toHaveCount(0);
  });
});

for (const role of ['coordinator', 'contributor', 'viewer'] as const) {
  test.describe(`Minor privacy as ${role}`, () => {
    test.use(as(role));

    test('a minor’s birth date and contact details are hidden', async ({ page, ward, api }) => {
      await open(page, `/directory/people/${ward.people.cora}`);
      await heading(page, 'Cora Abernathy');
      await expect(
        page.getByText('Date of birth and contact information are restricted for this record.'),
      ).toBeVisible();
      await expect(page.locator('#edit-dob')).toHaveCount(0);
      await page.getByRole('tab', { name: 'Contact & consent' }).click();
      await expect(
        page.getByText('Contact details are hidden for this restricted record.'),
      ).toBeVisible();
      await expect(page.getByText('cora.minor@example.test')).toHaveCount(0);

      const body = (await (
        await (await api(role)).get(`/directory/people/${ward.people.cora}`)
      ).json()) as {
        dateOfBirth: string | null;
        contactMethods: unknown[];
        restricted: boolean;
      };
      expect(body.restricted).toBe(true);
      expect(body.dateOfBirth).toBeNull();
      expect(body.contactMethods).toEqual([]);
    });

    test('someone with no birth date on file is treated as a minor', async ({ page, ward }) => {
      await open(page, `/directory/people/${ward.people.juniper}`);
      await expect(page.getByText('restricted for this record')).toBeVisible();
      await page.getByRole('tab', { name: 'Contact & consent' }).click();
      await expect(page.getByText('juniper.ellison@example.test')).toHaveCount(0);
    });

    test('an adult’s contact details remain visible', async ({ page, ward }) => {
      await open(page, `/directory/people/${ward.people.aaron}`);
      await page.getByRole('tab', { name: 'Contact & consent' }).click();
      await expect(page.getByText('aaron.abernathy@example.test')).toBeVisible();
    });
  });
}

test.describe('Directory write permission', () => {
  test.use(as('viewer'));

  test('a viewer cannot add or edit people even if they open the form', async ({
    page,
    ward,
    api,
  }) => {
    await open(page, '/directory/people/new');
    await fill(page, '#first-name', 'Fictional');
    await fill(page, '#last-name', 'Blocked');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('alert')).toContainText('Your role doesn’t include access to this.');
    await expect(page.getByText('Missing required permission')).toHaveCount(0);

    const viewerApi = await api('viewer');
    expect(
      (
        await viewerApi.patch(`/directory/people/${ward.people.aaron}`, {
          data: { preferredName: 'Hacked' },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await viewerApi.post('/directory/households', { data: { name: 'Blocked' } })).status(),
    ).toBe(403);
  });
});

test.describe('Directory as contributor', () => {
  test.use(as('contributor'));

  test('a contributor can add a person but sees minors restricted', async ({ page }) => {
    const last = `Contrib${unique()}`;
    await open(page, '/directory/people/new');
    await fill(page, '#first-name', 'Fictional');
    await fill(page, '#last-name', last);
    await page.getByLabel('Date of birth (optional)').fill('2015-01-01');
    await page.getByRole('button', { name: 'Save' }).click();
    await heading(page, `Fictional ${last}`);
    // Contributors cannot see minors' details, even for a record they just created.
    await expect(page.getByText('restricted for this record')).toBeVisible();
    expect(personByKey('cora').age).toBeLessThan(18);
  });
});
