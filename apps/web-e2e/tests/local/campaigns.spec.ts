import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { AUDIENCES, CAMPAIGNS, unitByKey } from '../../mock-ward/fixture';
import type { MockWardState } from '../../mock-ward/state';
import { expect, fill, heading, open, test, unique, reload } from './helpers/fixtures';
import { as } from './helpers/sessions';

async function createCampaign(
  api: APIRequestContext,
  ward: MockWardState,
  audienceKeys: string[] = ['newsletter'],
  baseMessage = 'A fictional campaign message.',
): Promise<{ id: string; name: string }> {
  const name = `Fictional Campaign ${unique()}`;
  const created = await api.post('/campaigns', { data: { name, baseMessage } });
  expect(created.status(), await created.text()).toBe(201);
  const id = ((await created.json()) as { id: string }).id;
  for (const key of audienceKeys) {
    const added = await api.post(`/campaigns/${id}/audiences`, {
      data: { audienceGroupId: ward.audiences[key] },
    });
    expect(added.ok(), await added.text()).toBe(true);
  }
  return { id, name };
}

async function tab(
  page: Page,
  name: 'Setup' | 'Content' | 'Review' | 'Approve & send',
): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
}

async function status(page: Page, label: string): Promise<void> {
  await expect(page.locator('.page-header .status-pill').first()).toHaveText(label);
}

test.describe('Campaign list', () => {
  test.use(as('wardAdmin'));

  test('shows every seeded campaign with its status', async ({ page }) => {
    await open(page, '/campaigns');
    await heading(page, 'Campaigns');
    await expect(page.getByText('Local development uses the provider simulator')).toBeVisible();
    const expected: Array<[keyof typeof CAMPAIGNS, string]> = [
      ['draft', 'Draft'],
      ['pending', 'Waiting for approval'],
      ['approved', 'Approved'],
      ['rejected', 'Rejected'],
      ['scheduled', 'Scheduled'],
      ['sent', 'Sent'],
      ['cancelled', 'Cancelled'],
    ];
    for (const [key, label] of expected) {
      const row = page.locator('ul.results li', {
        has: page.getByRole('link', { name: CAMPAIGNS[key].name }),
      });
      await expect(row.locator('.tag').first()).toHaveText(label);
    }
  });

  test('the status filter narrows the list to that status', async ({ page }) => {
    await open(page, '/campaigns');
    for (const [label, key] of [
      ['Waiting for approval', 'pending'],
      ['Rejected', 'rejected'],
      ['Scheduled', 'scheduled'],
      ['Sent', 'sent'],
      ['Cancelled', 'cancelled'],
    ] as const) {
      await page.getByLabel('Status').selectOption({ label });
      await page.getByRole('button', { name: 'Search' }).click();
      await expect(page.getByRole('link', { name: CAMPAIGNS[key].name })).toBeVisible();
      await expect
        .poll(async () => [
          ...new Set(
            await page
              .locator('ul.results li')
              .evaluateAll((rows) =>
                rows.map((row) => row.querySelector('.tag')?.textContent?.trim()),
              ),
          ),
        ])
        .toEqual([label]);
    }
  });

  test('search by name, the empty state and the archived filter', async ({ page }) => {
    await open(page, '/campaigns');
    await fill(page, '#campaign-query', 'Choir');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('ul.results li')).toHaveCount(1);

    await fill(page, '#campaign-query', 'Archived Draft');
    await page.getByLabel('Include archived').check();
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(
      page
        .locator('ul.results li', { hasText: CAMPAIGNS.archived.name })
        .locator('.tag', { hasText: /^Archived$/ }),
    ).toBeVisible();

    await fill(page, '#campaign-query', 'No Fictional Campaign Like This');
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.getByText('No campaigns found')).toBeVisible();
    await page.getByRole('link', { name: 'Create campaign' }).last().click();
    await heading(page, 'Create campaign');
  });

  test('archived campaigns stay hidden until “Include archived” is ticked', async ({ page }) => {
    test.fail(
      true,
      'BUG: the web client sends includeArchived=false and z.coerce.boolean() reads "false" as true.',
    );
    await open(page, '/campaigns');
    await expect(page.getByRole('link', { name: CAMPAIGNS.draft.name })).toBeVisible();
    await expect(page.getByRole('link', { name: CAMPAIGNS.archived.name })).toHaveCount(0);
  });
});

test.describe('Create campaign', () => {
  test.use(as('contributor'));

  test('a blank name is rejected, Cancel goes back, and a draft opens on Setup', async ({
    page,
  }) => {
    await open(page, '/campaigns/new');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('link', { name: 'Cancel' }).click();
    await heading(page, 'Campaigns');

    const name = `Fictional Bake Sale ${unique()}`;
    await open(page, '/campaigns/new');
    await fill(page, '#campaign-name', name);
    await page.locator('#campaign-base-message').fill('Bring fictional cookies.');
    await page.getByRole('button', { name: 'Create draft' }).click();
    await heading(page, name);
    await status(page, 'Draft');
    await expect(page.getByRole('tab', { name: 'Setup' })).toHaveAttribute('aria-selected', 'true');
    await tab(page, 'Content');
    await expect(page.locator('#base-message')).toHaveValue('Bring fictional cookies.');
  });
});

test.describe('Campaign editor as ward admin', () => {
  test.use(as('wardAdmin'));

  test('setup: rename, add an audience with an override, see its destinations, remove it', async ({
    page,
    api,
    ward,
  }) => {
    const campaign = await createCampaign(await api('wardAdmin'), ward, []);
    await open(page, `/campaigns/${campaign.id}`);
    await fill(page, '#edit-name', `${campaign.name} Renamed`);
    await page.getByRole('button', { name: 'Save name' }).click();
    await heading(page, `${campaign.name} Renamed`);

    await expect(page.getByText('No audiences selected yet.')).toBeVisible();
    await page.getByLabel('Add audience').selectOption({ label: AUDIENCES.textAlerts.name });
    await page.locator('#audience-override-text').fill('Fictional override for text subscribers.');
    await page.getByRole('button', { name: 'Add audience' }).click();
    await expect(page.getByRole('heading', { name: 'Audiences (1)' })).toBeVisible();
    await expect(
      page.getByText('Override: Fictional override for text subscribers.'),
    ).toBeVisible();
    await expect(page.getByText('Fictional Ward Text Alerts (SMS)')).toBeVisible();

    await page
      .locator('li', { hasText: AUDIENCES.textAlerts.name })
      .getByRole('button', { name: 'Remove' })
      .click();
    await expect(page.getByRole('heading', { name: 'Audiences (0)' })).toBeVisible();
    await expect(
      page.getByText('Add audiences with linked destinations to see them here.'),
    ).toBeVisible();
  });

  test('content: base message, per-channel text, overlap strategy', async ({ page, api, ward }) => {
    const campaign = await createCampaign(await api('wardAdmin'), ward, ['adults', 'newsletter']);
    await open(page, `/campaigns/${campaign.id}`);
    await tab(page, 'Content');
    await page.locator('#base-message').fill('Updated fictional base message.');
    await page.getByRole('button', { name: 'Save content' }).click();
    await expect(page.getByRole('heading', { name: /Base message \(version 1\)/ })).toBeVisible();

    for (const [channel, text] of [
      ['Email', 'Fictional email body.'],
      ['Sms', 'Fictional SMS.'],
      ['FacebookPage', 'Fictional Facebook post.'],
    ] as const) {
      await page.locator(`#channel-${channel}`).fill(text);
      await page
        .locator('.channel-block', { has: page.locator(`#channel-${channel}`) })
        .getByRole('button', { name: 'Save' })
        .click();
      await expect(page.getByRole('alert')).toHaveCount(0);
    }
    await page.locator('#channel-Sms').fill('y'.repeat(161));
    await page
      .locator('.channel-block', { has: page.locator('#channel-Sms') })
      .getByRole('button', { name: 'Save' })
      .click();
    await expect(page.getByRole('alert')).toContainText('exceeds the maximum length of 160');
    await reload(page);
    await tab(page, 'Content');
    await expect(page.locator('#channel-Sms')).toHaveValue('Fictional SMS.');
    await page
      .locator('.channel-block', { has: page.locator('#channel-Sms') })
      .getByRole('button', { name: 'Clear' })
      .click();
    await expect(page.locator('#channel-Sms')).toHaveValue('');
    await reload(page);
    await tab(page, 'Content');
    await expect(page.locator('#channel-Sms')).toHaveValue('');
    await expect(page.locator('#channel-Email')).toHaveValue('Fictional email body.');

    await page.getByLabel('Strategy').selectOption('PreferSpecificAudience');
    await page.getByLabel('Preferred audience').selectOption({ label: AUDIENCES.newsletter.name });
    await page.getByRole('button', { name: 'Save strategy' }).click();
    await reload(page);
    await tab(page, 'Content');
    await expect(page.getByLabel('Strategy')).toHaveValue('PreferSpecificAudience');
    await expect(page.getByLabel('Preferred audience')).toHaveValue(
      ward.audiences.newsletter ?? '',
    );
  });

  test('content: register an image, generate an AI draft, confirm one and discard another', async ({
    page,
    api,
    ward,
  }) => {
    const campaign = await createCampaign(await api('wardAdmin'), ward);
    await open(page, `/campaigns/${campaign.id}`);
    await tab(page, 'Content');
    await page.getByText('Images & assets').click();
    await fill(page, '#asset-storage-reference', 'https://example.test/fictional-picnic.jpg');
    await fill(page, '#asset-alt-text', 'A fictional picnic table');
    await page.getByRole('button', { name: 'Register image' }).click();
    await expect(page.getByLabel('Base image (optional)')).toBeVisible();
    await expect(page.getByLabel('Base image (optional)').locator('option')).toHaveCount(2);

    await page.getByText('Generate image with AI').click();
    await page.locator('#ai-prompt').fill('A fictional chapel at sunset');
    await fill(page, '#ai-alt-text', 'Fictional chapel');
    await page.getByRole('button', { name: 'Generate draft' }).click();
    await expect(page.getByText('Pending draft: Pending')).toBeVisible();
    await page.getByRole('button', { name: 'Confirm' }).click();
    await expect(page.getByText('Pending draft: Confirmed')).toBeVisible();
    await expect(page.getByLabel('Base image (optional)').locator('option')).toHaveCount(3);

    await page.locator('#ai-prompt').fill('A second fictional image');
    await fill(page, '#ai-alt-text', 'Second fictional image');
    await page.getByRole('button', { name: 'Generate draft' }).click();
    await expect(page.getByText('Pending draft: Pending')).toBeVisible();
    await page.getByRole('button', { name: 'Discard' }).click();
    await expect(page.getByText(/Pending draft:/)).toHaveCount(0);

    await page.getByLabel('Base image (optional)').selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Save content' }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('review: preview de-duplicates overlapping audiences and flags long SMS text', async ({
    page,
    api,
    ward,
  }) => {
    const admin = await api('wardAdmin');
    // A long base message with no SMS override is too long for a text message.
    const campaign = await createCampaign(
      admin,
      ward,
      ['adults', 'newsletter', 'textAlerts'],
      `Fictional long message. ${'x'.repeat(200)}`,
    );
    await open(page, `/campaigns/${campaign.id}`);
    await tab(page, 'Review');
    await page.getByRole('button', { name: 'Load preview' }).click();
    await expect(page.getByText(/\d+ unique recipient\(s\), \d+ overlapping\./)).toBeVisible();
    const summary = (await page.getByText(/unique recipient\(s\)/).textContent()) ?? '';
    const [unique_, overlapping] = (summary.match(/\d+/g) ?? []).map(Number);
    expect(overlapping).toBeGreaterThan(0);
    const adultsCount = Number(
      (
        await page
          .getByRole('heading', { name: new RegExp(`${AUDIENCES.adults.name} —`) })
          .textContent()
      )?.match(/(\d+) recipient/)?.[1],
    );
    const newsletterCount = Number(
      (
        await page
          .getByRole('heading', { name: new RegExp(`${AUDIENCES.newsletter.name} —`) })
          .textContent()
      )?.match(/(\d+) recipient/)?.[1],
    );
    const textCount = Number(
      (
        await page
          .getByRole('heading', { name: new RegExp(`${AUDIENCES.textAlerts.name} —`) })
          .textContent()
      )?.match(/(\d+) recipient/)?.[1],
    );
    expect(unique_).toBeLessThan(adultsCount + newsletterCount + textCount);
    expect(unique_).toBeGreaterThanOrEqual(adultsCount);
    await expect(page.getByRole('heading', { name: 'Overlapping people' })).toBeVisible();
    await expect(page.getByText('Aaron Abernathy is in more than one audience.')).toBeVisible();
    await expect(page.getByText('Exceeds limit').first()).toBeVisible();
  });

  test('review: readiness lists problems for an empty draft and passes a complete one', async ({
    page,
    api,
    ward,
  }) => {
    const admin = await api('wardAdmin');
    const created = await admin.post('/campaigns', {
      data: { name: `Fictional Empty ${unique()}` },
    });
    const emptyId = ((await created.json()) as { id: string }).id;
    await open(page, `/campaigns/${emptyId}`);
    await tab(page, 'Review');
    await page.getByRole('button', { name: 'Check readiness' }).click();
    await expect(
      page
        .getByRole('tabpanel', { name: /Review/ })
        .getByRole('alert')
        .first(),
    ).toBeVisible();
    await expect(page.getByText('Ready to submit for approval.')).toHaveCount(0);

    const complete = await createCampaign(admin, ward);
    await open(page, `/campaigns/${complete.id}`);
    await tab(page, 'Review');
    await page.getByRole('button', { name: 'Check readiness' }).click();
    await expect(page.getByText('Ready to submit for approval.')).toBeVisible();
  });

  test('a campaign that is not a draft cannot be edited', async ({ page, ward }) => {
    await open(page, `/campaigns/${ward.campaigns.pending}`);
    await status(page, 'Waiting for approval');
    await expect(page.getByLabel('Add audience')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Add audience' })).toBeDisabled();
    await tab(page, 'Content');
    await expect(
      page.getByText('Content can only be edited while the campaign is a draft.'),
    ).toBeVisible();
    await expect(page.locator('#base-message')).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Save content' })).toBeDisabled();
  });

  test('schedule refuses a missing or past time', async ({ page, api, ward }) => {
    const admin = await api('wardAdmin');
    const campaign = await createCampaign(admin, ward);
    await admin.post(`/campaigns/${campaign.id}/submit`);
    await admin.post(`/campaigns/${campaign.id}/approve`, { data: {} });
    await open(page, `/campaigns/${campaign.id}`);
    await tab(page, 'Approve & send');
    await page.getByRole('button', { name: 'Schedule send' }).click();
    await expect(page.getByRole('alert')).toHaveText('Choose a date and time first.');
    await page.locator('#schedule-at').fill('2020-01-01T09:00');
    await page.getByRole('button', { name: 'Schedule send' }).click();
    await expect(page.getByRole('alert')).toContainText('must be in the future');
    await status(page, 'Approved');
  });

  test('archive a draft', async ({ page, api, ward }) => {
    const campaign = await createCampaign(await api('wardAdmin'), ward);
    await open(page, `/campaigns/${campaign.id}`);
    await tab(page, 'Approve & send');
    await page.getByRole('button', { name: 'Archive' }).click();
    await expect(page.locator('.status-pill', { hasText: 'Archived' })).toBeVisible();
  });

  test('cancel a campaign that is waiting for approval', async ({ page, api, ward }) => {
    const admin = await api('wardAdmin');
    const campaign = await createCampaign(admin, ward);
    await admin.post(`/campaigns/${campaign.id}/submit`);
    await open(page, `/campaigns/${campaign.id}`);
    await tab(page, 'Approve & send');
    await page.getByRole('button', { name: 'Cancel campaign' }).click();
    await status(page, 'Cancelled');
    await expect(page.getByRole('button', { name: 'Cancel campaign' })).toHaveCount(0);
  });

  test('the seeded sent campaign shows delivery results: sent, skipped for consent, and an isolated failure', async ({
    page,
    ward,
  }) => {
    await open(page, `/campaigns/${ward.campaigns.sent}`);
    await status(page, 'Sent');
    await tab(page, 'Approve & send');
    const results = page.locator('section', {
      has: page.getByRole('heading', { name: 'Delivery results' }),
    });
    await expect(results.getByRole('button', { name: /Batch .* — Partial failure/ })).toBeVisible();
    const row = (name: string, channel: string): Locator =>
      results.locator('li.item-list__row', { hasText: name }).filter({ hasText: channel });
    await expect(row('Aaron Abernathy', 'Email')).toContainText('Sent');
    await expect(row('Aaron Abernathy', 'SMS')).toContainText('Sent');
    await expect(row('Gideon Castellan', 'SMS')).toContainText('Sent');
    await expect(row('Fiona Brightwater', 'Email')).toContainText('Consent not granted');
    await expect(row('Ignatius Delacroix', 'Email')).toContainText('Consent not granted');
    await expect(row('Harriet Delacroix', 'Email')).toContainText('Dead lettered');
    await expect(row('Harriet Delacroix', 'Email')).toContainText('Simulated permanent failure');
    // A person in several audiences is still contacted once per channel.
    await expect(row('Aaron Abernathy', 'Email')).toHaveCount(1);
    await results.getByRole('button', { name: 'Refresh results' }).click();
    await expect(row('Aaron Abernathy', 'Email')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Send now' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Cancel campaign' })).toHaveCount(0);
  });

  test('channels follow each audience: someone in the SMS-only audience is not emailed', async ({
    api,
    ward,
  }) => {
    test.fail(
      true,
      'Possible bug: destinations are pooled per campaign, so every member gets every channel. Gideon (SMS-only audience) is queued for Email too.',
    );
    const batches = (await (
      await (await api('wardAdmin')).get(`/campaigns/${ward.campaigns.sent}/delivery-batches`)
    ).json()) as {
      batches: Array<{ id: string }>;
    };
    const detail = (await (
      await (
        await api('wardAdmin')
      ).get(`/campaigns/${ward.campaigns.sent}/delivery-batches/${batches.batches[0]?.id}`)
    ).json()) as { recipients: Array<{ displayName: string; channel: string }> };
    expect(
      detail.recipients
        .filter((recipient) => recipient.displayName === 'Gideon Castellan')
        .map((r) => r.channel),
    ).toEqual(['Sms']);
  });
});

test.describe('Approval workflow across roles', () => {
  test('contributor submits, coordinator rejects, contributor reopens, coordinator approves and sends', async ({
    browser,
    api,
    ward,
  }) => {
    test.setTimeout(150_000);
    const campaign = await createCampaign(await api('contributor'), ward, ['newsletter']);
    const contributor = await browser.newContext(as('contributor'));
    const coordinator = await browser.newContext(as('coordinator'));
    try {
      const writer = await contributor.newPage();
      await open(writer, `/campaigns/${campaign.id}`);
      await tab(writer, 'Approve & send');
      await expect(writer.getByRole('button', { name: 'Send now' })).toHaveCount(0);
      await expect(writer.getByRole('heading', { name: 'Delivery results' })).toHaveCount(0);
      await writer.getByRole('button', { name: 'Submit for approval' }).click();
      await status(writer, 'Waiting for approval');
      await expect(writer.getByRole('heading', { name: 'Approval decision' })).toHaveCount(0);

      const approver = await coordinator.newPage();
      await open(approver, '/');
      await approver
        .getByRole('region', { name: 'Pending approvals' })
        .getByRole('link', { name: campaign.name })
        .click();
      await tab(approver, 'Approve & send');
      await approver.locator('#approval-comment').fill('Fictional: please add the time.');
      await approver.getByRole('button', { name: 'Reject' }).click();
      await status(approver, 'Rejected');
      await expect(approver.getByText('Rejected · ')).toBeVisible();
      await expect(approver.getByText('— Fictional: please add the time.')).toBeVisible();

      await reload(writer);
      await tab(writer, 'Approve & send');
      await writer.getByRole('button', { name: 'Reopen as draft' }).click();
      await status(writer, 'Draft');
      // Reopening starts a new version without the audiences (see the known-issue test below).
      if (await writer.getByText('No audiences selected yet.').isVisible()) {
        await tab(writer, 'Setup');
        await writer.getByLabel('Add audience').selectOption({ label: AUDIENCES.newsletter.name });
        await writer.getByRole('button', { name: 'Add audience' }).click();
        await expect(writer.getByRole('heading', { name: 'Audiences (1)' })).toBeVisible();
      }
      await tab(writer, 'Content');
      await writer.locator('#base-message').fill('A fictional message, now with a time: 7pm.');
      await writer.getByRole('button', { name: 'Save content' }).click();
      await expect(
        writer.getByRole('heading', { name: /Base message \(version 2\)/ }),
      ).toBeVisible();
      await tab(writer, 'Approve & send');
      await writer.getByRole('button', { name: 'Submit for approval' }).click();
      await status(writer, 'Waiting for approval');

      await reload(approver);
      await tab(approver, 'Approve & send');
      await approver.locator('#approval-comment').fill('Fictional: looks good.');
      await approver.getByRole('button', { name: 'Approve' }).click();
      await status(approver, 'Approved');
      await expect(approver.getByRole('heading', { name: 'Schedule' })).toBeVisible();
      await approver.getByRole('button', { name: 'Send now' }).click();
      await status(approver, 'Sent');
      await expect(
        approver.getByRole('button', { name: /Batch .* — (Completed|Partial failure)/ }),
      ).toBeVisible();

      // Sent campaigns appear on the ward's public page.
      await open(approver, `/${unitByKey('ward').publicSlug}`);
      await expect(approver.getByRole('heading', { name: campaign.name })).toBeVisible();
    } finally {
      await contributor.close();
      await coordinator.close();
    }
  });

  test('coordinator schedules an approved campaign, then cancels it', async ({
    browser,
    api,
    ward,
  }) => {
    const admin = await api('wardAdmin');
    const campaign = await createCampaign(admin, ward);
    await admin.post(`/campaigns/${campaign.id}/submit`);
    await admin.post(`/campaigns/${campaign.id}/approve`, { data: {} });
    const context = await browser.newContext(as('coordinator'));
    try {
      const page = await context.newPage();
      await open(page, `/campaigns/${campaign.id}`);
      await tab(page, 'Approve & send');
      const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const local = new Date(future.getTime() - future.getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
      await page.locator('#schedule-at').fill(local);
      await page.getByRole('button', { name: 'Schedule send' }).click();
      await status(page, 'Scheduled');
      await expect(page.locator('li', { hasText: 'Scheduled for' })).toBeVisible();
      await page.getByRole('button', { name: 'Cancel campaign' }).click();
      await status(page, 'Cancelled');
      await expect(page.getByRole('button', { name: 'Send now' })).toHaveCount(0);
    } finally {
      await context.close();
    }
  });
});

test.describe('Known campaign issues', () => {
  test.use(as('wardAdmin'));

  test('reopening a rejected campaign keeps its audiences and channel text', async ({
    api,
    ward,
  }) => {
    test.fail(
      true,
      'UX bug: "Reopen as draft" starts version 2 with only the base message; audiences, channel text and overlap settings are dropped, so Submit fails.',
    );
    const admin = await api('wardAdmin');
    const campaign = await createCampaign(admin, ward, ['newsletter']);
    await admin.post(`/campaigns/${campaign.id}/channel-text`, {
      data: { channel: 'Sms', text: 'Fictional SMS' },
    });
    await admin.post(`/campaigns/${campaign.id}/submit`);
    await admin.post(`/campaigns/${campaign.id}/reject`, { data: {} });
    const revised = (await (await admin.post(`/campaigns/${campaign.id}/revise`)).json()) as {
      currentVersion: { audiences: unknown[]; channelVersions: unknown[] };
    };
    expect(revised.currentVersion.audiences).toHaveLength(1);
    expect(revised.currentVersion.channelVersions).toHaveLength(1);
  });

  test('workflow tabs hide the panels that are not selected', async ({ page, ward }) => {
    test.fail(
      true,
      'BUG: .workflow-tabs__panel sets display:flex, which overrides the hidden attribute, so every tab panel is always shown.',
    );
    await open(page, `/campaigns/${ward.campaigns.draft}`);
    await expect(page.getByRole('heading', { name: 'Campaign details' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Workflow actions' })).toBeHidden();
    await open(page, `/directory/people/${ward.people.aaron}`);
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add contact method' })).toBeHidden();
  });

  test('cancelling a scheduled campaign marks its schedule cancelled', async ({ api, ward }) => {
    test.fail(
      true,
      'Minor: cancelling leaves CampaignSchedule.cancelledAt empty, so History never shows the schedule as cancelled (the worker still skips it because the campaign is Cancelled).',
    );
    const admin = await api('wardAdmin');
    const campaign = await createCampaign(admin, ward);
    await admin.post(`/campaigns/${campaign.id}/submit`);
    await admin.post(`/campaigns/${campaign.id}/approve`, { data: {} });
    await admin.post(`/campaigns/${campaign.id}/schedule`, {
      data: { scheduledFor: new Date(Date.now() + 864e6).toISOString() },
    });
    const cancelled = (await (await admin.post(`/campaigns/${campaign.id}/cancel`)).json()) as {
      schedules: Array<{ cancelledAt: string | null }>;
    };
    expect(cancelled.schedules[0]?.cancelledAt).not.toBeNull();
  });

  test('history times are shown in the ward’s time zone, not raw UTC', async ({ page, ward }) => {
    test.fail(
      true,
      'AGENTS.md: "Display timestamps using the configured ward time zone." History shows raw ISO UTC strings.',
    );
    await open(page, `/campaigns/${ward.campaigns.scheduled}`);
    await tab(page, 'Approve & send');
    await expect(page.locator('li', { hasText: 'Scheduled for' })).toBeVisible();
    await expect(page.getByText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z/)).toHaveCount(0);
  });
});

test.describe('Campaign permissions', () => {
  test.use(as('contributor'));

  test('a contributor cannot approve, send or schedule even by calling the API', async ({
    api,
    ward,
  }) => {
    const contributor = await api('contributor');
    expect(
      (
        await contributor.post(`/campaigns/${ward.campaigns.pending}/approve`, { data: {} })
      ).status(),
    ).toBe(403);
    expect(
      (
        await contributor.post(`/campaigns/${ward.campaigns.pending}/reject`, { data: {} })
      ).status(),
    ).toBe(403);
    expect(
      (await contributor.post(`/campaigns/${ward.campaigns.approved}/send-now`)).status(),
    ).toBe(403);
    expect(
      (
        await contributor.post(`/campaigns/${ward.campaigns.approved}/schedule`, {
          data: { scheduledFor: new Date(Date.now() + 864e5).toISOString() },
        })
      ).status(),
    ).toBe(403);
    expect(
      (await contributor.get(`/campaigns/${ward.campaigns.sent}/delivery-batches`)).status(),
    ).toBe(403);
  });

  test('a contributor sees no approval controls on a pending campaign', async ({ page, ward }) => {
    await open(page, `/campaigns/${ward.campaigns.pending}`);
    await tab(page, 'Approve & send');
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Reject' })).toHaveCount(0);
  });
});

test.describe('Campaigns for a viewer', () => {
  test.use(as('viewer'));

  test('a viewer is sent away from the create page and cannot create through the API', async ({
    page,
    api,
  }) => {
    await open(page, '/campaigns/new');
    await expect(page).toHaveURL(/\/campaigns$/);
    expect(
      (await (await api('viewer')).post('/campaigns', { data: { name: 'Blocked' } })).status(),
    ).toBe(403);
  });
});
