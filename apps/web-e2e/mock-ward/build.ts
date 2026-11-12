/**
 * Builds the fictional mock ward through the real API, so the seed itself
 * exercises the same endpoints the app uses. Expects a freshly reset
 * database (see reset-db.ts) and a running API.
 */
import type { WardCommsApiClient } from '@ward-comms/api-client';
import { signedInClient, waitForApi } from './api';
import {
  AUDIENCES,
  BULLETIN,
  CAMPAIGNS,
  CUSTOM_ORGANIZATION,
  DESTINATIONS,
  FACEBOOK_PAGE,
  HOUSEHOLDS,
  PEOPLE,
  SUPERADMIN,
  UNITS,
  WARD_USERS,
  birthDateForAge,
  personByKey,
  unitByKey,
  type MockPerson,
} from './fixture';
import { saveMockWardState, type MockWardState } from './state';

async function createPerson(client: WardCommsApiClient, person: MockPerson): Promise<string> {
  const created = await client.createPerson({
    firstName: person.firstName,
    lastName: person.lastName,
    preferredName: person.preferredName,
    gender: person.gender,
    dateOfBirth: person.age === null ? undefined : birthDateForAge(person.age),
  });
  return created.id;
}

export async function buildMockWard(apiUrl: string): Promise<MockWardState> {
  await waitForApi(apiUrl);

  // --- Hierarchy (platform operator) ---------------------------------------
  const platform = await signedInClient(apiUrl, {
    username: SUPERADMIN.username,
    password: SUPERADMIN.password,
  });
  const units: MockWardState['units'] = {};
  for (const unit of UNITS) {
    const created = await platform.createWard({
      name: unit.name,
      level: unit.level,
      parentId: unit.parentKey ? units[unit.parentKey]?.id : undefined,
      timeZone: 'America/Denver',
      publicSlug: unit.publicSlug,
      adminUsername: unit.admin.username,
      adminEmail: unit.admin.email,
      adminDisplayName: unit.admin.displayName,
      adminPassword: unit.admin.password,
      initialWardCode: unit.code,
    });
    units[unit.key] = { id: created.ward.id, adminUserId: created.adminUserId };
  }

  // --- Maple Hollow users ---------------------------------------------------
  const wardUnit = unitByKey('ward');
  const admin = await signedInClient(apiUrl, {
    username: wardUnit.admin.username,
    password: wardUnit.admin.password,
    unitCode: wardUnit.code,
  });
  const { roles } = await admin.listRoles();
  const roleIds: Record<string, string> = Object.fromEntries(
    roles.map((role) => [role.name, role.id]),
  );
  const users: Record<string, string> = { wardAdmin: units.ward?.adminUserId ?? '' };
  for (const user of WARD_USERS) {
    const created = await admin.createUser({
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      password: user.password,
      roleIds: user.roles.map((role) => {
        const id = roleIds[role];
        if (!id) throw new Error(`Role ${role} is missing from the catalog.`);
        return id;
      }),
    });
    users[user.key] = created.id;
    if (user.disabled) {
      await admin.disableUser(created.id);
    }
  }

  // --- Directory ------------------------------------------------------------
  const households: Record<string, string> = {};
  for (const household of HOUSEHOLDS) {
    const created = await admin.createHousehold({
      name: household.name,
      addressLine1: household.addressLine1,
      city: household.city,
      state: household.state,
      postalCode: household.postalCode,
    });
    households[household.key] = created.id;
  }

  const people: Record<string, string> = {};
  for (const person of PEOPLE.filter((candidate) => candidate.key !== 'aspenOnly')) {
    const personId = await createPerson(admin, person);
    people[person.key] = personId;
    if (person.householdKey) {
      await admin.addHouseholdMembership(personId, {
        householdId: households[person.householdKey] ?? '',
        householdRole: person.householdRole,
      });
    }
    for (const contact of person.contacts ?? []) {
      const detail = await admin.addContactMethod(personId, {
        type: contact.type,
        value: contact.value,
      });
      const method = detail.contactMethods.find(
        (candidate) =>
          candidate.type === contact.type && !candidate.archivedAt && candidate.consent === null,
      );
      const methodId = method?.id ?? detail.contactMethods.at(-1)?.id;
      if (contact.consent && methodId) {
        await admin.setConsent(personId, methodId, {
          status: contact.consent,
          source: 'Fictional mock-ward seed',
        });
      }
    }
  }
  await admin.addRelationship(people.aaron ?? '', {
    relatedPersonId: people.beatrice ?? '',
    relationshipType: 'Husband',
  });
  await admin.addRelationship(people.aaron ?? '', {
    relatedPersonId: people.cora ?? '',
    relationshipType: 'Parent',
  });
  await admin.addRelationship(people.beatrice ?? '', {
    relatedPersonId: people.dashiell ?? '',
    relationshipType: 'Parent',
  });
  await admin.addRelationship(people.evander ?? '', {
    relatedPersonId: people.fiona ?? '',
    relationshipType: 'Spouse',
  });
  for (const person of PEOPLE.filter((candidate) => candidate.inactive)) {
    await admin.archivePerson(people[person.key] ?? '');
  }

  // --- Destinations ---------------------------------------------------------
  const destinations: Record<string, string> = {};
  for (const destination of DESTINATIONS) {
    const created = await admin.createDestination({
      name: destination.name,
      channel: destination.channel,
    });
    destinations[destination.key] = created.id;
    if (destination.archived) {
      await admin.archiveDestination(created.id);
    }
  }
  const facebook = await admin.connectFacebookPage({ ...FACEBOOK_PAGE });

  // --- Audiences ------------------------------------------------------------
  const audiences: Record<string, string> = {};
  for (const [key, audience] of Object.entries(AUDIENCES)) {
    const created = await admin.createAudience({
      name: audience.name,
      description: audience.description,
    });
    audiences[key] = created.id;
  }
  await admin.setAudienceRules(audiences.adults ?? '', {
    membershipMode: 'Rules',
    membershipRules: { ageMin: 18 },
  });
  await admin.applyAudienceRules(audiences.adults ?? '');
  await admin.setAudienceRules(audiences.sisters ?? '', {
    membershipMode: 'Rules',
    membershipRules: { ageMin: 18, genders: ['Female'] },
  });
  await admin.applyAudienceRules(audiences.sisters ?? '');
  for (const key of ['cora', 'dashiell']) {
    await admin.addAudienceMember(audiences.youth ?? '', { personId: people[key] ?? '' });
  }
  for (const key of ['aaron', 'evander', 'fiona', 'harriet', 'ignatius']) {
    await admin.addAudienceMember(audiences.newsletter ?? '', { personId: people[key] ?? '' });
  }
  for (const key of ['aaron', 'gideon']) {
    await admin.addAudienceMember(audiences.textAlerts ?? '', { personId: people[key] ?? '' });
  }
  await admin.addAudienceMember(audiences.archived ?? '', { personId: people.evander ?? '' });
  await admin.archiveAudience(audiences.archived ?? '');

  const links: Array<[string, string]> = [
    ['adults', destinations.email ?? ''],
    ['adults', facebook.destinationId],
    ['youth', destinations.email ?? ''],
    ['sisters', destinations.email ?? ''],
    ['newsletter', destinations.email ?? ''],
    ['textAlerts', destinations.sms ?? ''],
  ];
  for (const [audienceKey, destinationId] of links) {
    await admin.addAudienceDestination(audiences[audienceKey] ?? '', { destinationId });
  }

  // --- Campaigns in every status --------------------------------------------
  const campaigns: Record<string, string> = {};
  async function draft(key: keyof typeof CAMPAIGNS, audienceKeys: string[]): Promise<string> {
    const spec = CAMPAIGNS[key];
    const created = await admin.createCampaign({ name: spec.name, baseMessage: spec.baseMessage });
    for (const audienceKey of audienceKeys) {
      await admin.addCampaignAudience(created.id, {
        audienceGroupId: audiences[audienceKey] ?? '',
      });
    }
    campaigns[key] = created.id;
    return created.id;
  }

  await draft('draft', ['adults', 'newsletter']);
  const pending = await draft('pending', ['adults']);
  await admin.submitCampaignForApproval(pending);

  const approved = await draft('approved', ['sisters']);
  await admin.submitCampaignForApproval(approved);
  await admin.approveCampaign(approved, 'Fictional approval note.');

  const rejected = await draft('rejected', ['newsletter']);
  await admin.submitCampaignForApproval(rejected);
  await admin.rejectCampaign(rejected, 'Fictional rejection: please shorten.');

  const scheduled = await draft('scheduled', ['adults']);
  await admin.submitCampaignForApproval(scheduled);
  await admin.approveCampaign(scheduled);
  await admin.scheduleCampaign(
    scheduled,
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  );

  const sent = await draft('sent', ['newsletter', 'textAlerts']);
  await admin.setCampaignChannelText(sent, {
    channel: 'Sms',
    text: 'Fictional welcome text message.',
  });
  await admin.submitCampaignForApproval(sent);
  await admin.approveCampaign(sent);
  await admin.sendCampaignNow(sent);

  const cancelled = await draft('cancelled', ['youth']);
  await admin.submitCampaignForApproval(cancelled);
  await admin.cancelCampaign(cancelled);

  const archived = await draft('archived', ['youth']);
  await admin.archiveCampaign(archived);

  // --- Providers ------------------------------------------------------------
  const activeCredential = await admin.upsertProviderCredential({
    channel: 'Email',
    providerAccountReference: 'fictional-email-account',
    credentialsJson: JSON.stringify({
      provider: 'smtp',
      host: 'localhost',
      port: 1025,
      user: 'fictional',
      pass: 'fictional',
      fromAddress: 'noreply@maplehollow.example.test',
    }),
  });
  const revokedCredential = await admin.upsertProviderCredential({
    channel: 'Sms',
    providerAccountReference: 'fictional-sms-account',
    credentialsJson: JSON.stringify({
      accountSid: 'ACfictional',
      authToken: 'fictional',
      fromNumber: '+18015550100',
    }),
  });
  await admin.revokeProviderCredential(revokedCredential.id);

  // --- Organizations and bulletins -------------------------------------------
  const custom = await admin.createUnitOrganization(CUSTOM_ORGANIZATION);
  const { organizations: orgList } = await admin.listUnitOrganizations();
  const organizations: Record<string, string> = Object.fromEntries(
    orgList.map((org) => [org.name, org.id]),
  );
  organizations[CUSTOM_ORGANIZATION] = custom.id;

  const today = new Date().toISOString().slice(0, 10);
  const sections = [
    {
      organizationId: organizations['General'] ?? null,
      column: 'Main' as const,
      heading: 'Fictional Sacrament Meeting',
      subheading: 'Sunday 10:00 AM',
      bodyHtml: '<p>Welcome to the <strong>fictional</strong> Maple Hollow Ward.</p>',
      linkUrl: 'https://example.test/fictional-program',
      linkLabel: 'Program',
    },
    {
      organizationId: organizations['Relief Society'] ?? null,
      column: 'Main' as const,
      heading: 'Fictional Service Night',
      subheading: 'Thursday 7:00 PM',
      bodyHtml: '<ul><li>Bring a fictional casserole</li><li>Invite a friend</li></ul>',
    },
    {
      organizationId: organizations['Primary'] ?? null,
      column: 'Side' as const,
      heading: 'Fictional Primary Program',
      bodyHtml: '<p>Children will sing in the fictional program.</p>',
    },
    {
      organizationId: custom.id,
      column: 'Side' as const,
      heading: 'Fictional Moving Help',
      bodyHtml: '<p>Help the fictional Castellans move on Saturday.</p>',
    },
  ];
  const bulletin = await admin.createBulletin({ title: BULLETIN.title, issueDate: today });
  await admin.saveBulletin(bulletin.id, {
    title: BULLETIN.title,
    kicker: BULLETIN.kicker,
    issueDate: today,
    template: 'Newsletter',
    language: 'en',
    sections,
  });
  await admin.publishBulletin(bulletin.id);
  const spanish = await admin.copyBulletinAsLanguage(bulletin.id, 'es');
  await admin.saveBulletin(spanish.id, {
    title: BULLETIN.spanishTitle,
    kicker: BULLETIN.kicker,
    issueDate: today,
    template: 'Newsletter',
    language: 'es',
    sections: sections.map((section) => ({ ...section, heading: `${section.heading} (ES)` })),
  });
  await admin.publishBulletin(spanish.id);
  const draftBulletin = await admin.createBulletin({
    title: BULLETIN.draftTitle,
    issueDate: today,
  });

  // --- The neighbouring ward, for tenant isolation checks ---------------------
  const otherUnit = unitByKey('otherWard');
  const other = await signedInClient(apiUrl, {
    username: otherUnit.admin.username,
    password: otherUnit.admin.password,
    unitCode: otherUnit.code,
  });
  const aspenPersonId = await createPerson(other, personByKey('aspenOnly'));
  const aspenAudience = await other.createAudience({ name: 'Fictional Aspen Grove Members' });

  const state: MockWardState = {
    builtAt: new Date().toISOString(),
    units,
    users,
    roles: roleIds,
    households,
    people,
    destinations,
    facebookDestinationId: facebook.destinationId,
    audiences,
    campaigns,
    organizations,
    bulletins: { published: bulletin.id, spanish: spanish.id, draft: draftBulletin.id },
    providerCredentials: { active: activeCredential.id, revoked: revokedCredential.id },
    otherWard: { personId: aspenPersonId, audienceId: aspenAudience.id },
  };
  saveMockWardState(state);
  return state;
}
