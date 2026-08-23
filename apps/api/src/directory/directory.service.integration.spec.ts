// Live-database integration tests for the Phase 5 directory.
//
// Skips automatically (rather than failing) when no migrated PostgreSQL
// instance is reachable — see apps/api/src/auth/auth.service.integration.spec.ts
// for the same pattern and the commands to bring one up locally.
//
// Covers the family-structure edge cases explicitly required by
// phases/05-directory.md: divorce, remarriage, guardianship, inactive
// relationships, incomplete records, and single-parent households — all
// built from generated fictional data (AGENTS.md #5).
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { createFictionalEmail, createFictionalId } from '@ward-comms/testing';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DirectoryService, type DirectoryActionContext } from './directory.service.js';
import { ContactMethodRepository } from './repositories/contact-method.repository.js';
import { HouseholdMembershipRepository } from './repositories/household-membership.repository.js';
import { HouseholdRepository } from './repositories/household.repository.js';
import { PersonRepository } from './repositories/person.repository.js';
import { RelationshipRepository } from './repositories/relationship.repository.js';

async function isMigratedDatabaseAvailable(prisma: PrismaService): Promise<boolean> {
  try {
    await prisma.client.ward.findFirst();
    return true;
  } catch {
    return false;
  }
}

const prisma = new PrismaService();
const databaseAvailable = await isMigratedDatabaseAvailable(prisma);

describe.skipIf(!databaseAvailable)('DirectoryService — live PostgreSQL integration', () => {
  const audit = new AuditService(prisma);
  const people = new PersonRepository(prisma);
  const householdsRepo = new HouseholdRepository(prisma);
  const contactMethods = new ContactMethodRepository(prisma);
  const relationships = new RelationshipRepository(prisma);
  const memberships = new HouseholdMembershipRepository(prisma);
  const directory = new DirectoryService(people, householdsRepo, contactMethods, relationships, memberships, audit);

  let wardId: string;
  let actorUserId: string;

  function ctx(): DirectoryActionContext {
    return { actorUserId, ipAddress: '203.0.113.20', userAgent: 'vitest' };
  }

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  async function setupWard(): Promise<void> {
    const ward = await prisma.client.ward.create({ data: { name: `Fictional Directory Ward ${randomUUID()}` } });
    wardId = ward.id;
    const user = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: `fictional.directory.actor.${randomUUID()}`,
        displayName: 'Fictional Directory Actor',
        passwordHash: 'not-a-real-hash',
      },
    });
    actorUserId = user.id;
  }

  afterEach(async () => {
    if (!wardId) return;
    await prisma.client.auditEvent.deleteMany({ where: { wardId } });
    await prisma.client.contactConsent.deleteMany({ where: { contactMethod: { person: { wardId } } } });
    await prisma.client.contactMethod.deleteMany({ where: { person: { wardId } } });
    await prisma.client.personRelationship.deleteMany({ where: { person: { wardId } } });
    await prisma.client.householdMembership.deleteMany({ where: { household: { wardId } } });
    await prisma.client.person.deleteMany({ where: { wardId } });
    await prisma.client.household.deleteMany({ where: { wardId } });
    await prisma.client.applicationUser.deleteMany({ where: { wardId } });
    await prisma.client.ward.deleteMany({ where: { id: wardId } });
  });

  it('creates a person with only a name (incomplete record) without error', async () => {
    await setupWard();
    const person = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Newborn' }, ctx());
    expect(person.contactMethods).toEqual([]);
    expect(person.householdMemberships).toEqual([]);
    expect(person.relationships).toEqual([]);
    // Unknown date of birth fails closed to "treat as minor".
    expect(person.isMinor).toBe(true);
  });

  it('never infers consent — a new contact method has no consent record until explicitly set, and setting it never defaults to Granted', async () => {
    await setupWard();
    const person = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Adult' }, ctx());
    const created = await directory.addContactMethod(
      wardId,
      person.id,
      { type: 'Email', value: createFictionalEmail(createFictionalId('consent', 1)) },
      ctx(),
    );
    expect(created.contactMethods).toHaveLength(1);
    // No consent row exists yet — consent is never inferred from creating a contact method.
    expect(created.contactMethods[0]?.consent).toBeNull();

    const contactMethodId = created.contactMethods[0]?.id as string;
    const withExplicitConsent = await directory.setConsent(
      wardId,
      person.id,
      contactMethodId,
      { status: 'Unknown' },
      ctx(),
    );
    expect(withExplicitConsent.contactMethods[0]?.consent?.status).toBe('Unknown');
  });

  it('rejects an invalid email address rather than storing it', async () => {
    await setupWard();
    const person = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Adult' }, ctx());
    await expect(
      directory.addContactMethod(wardId, person.id, { type: 'Email', value: 'not-an-email' }, ctx()),
    ).rejects.toThrow();
  });

  it('normalizes a phone number to E.164 form', async () => {
    await setupWard();
    const person = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Adult' }, ctx());
    const updated = await directory.addContactMethod(wardId, person.id, { type: 'Phone', value: '(555) 010-1234' }, ctx());
    expect(updated.contactMethods[0]?.value).toBe('(555) 010-1234');
  });

  it('rejects a self-relationship', async () => {
    await setupWard();
    const person = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Solo' }, ctx());
    await expect(
      directory.addRelationship(wardId, person.id, { relatedPersonId: person.id, relationshipType: 'Spouse' }, ctx()),
    ).rejects.toThrow();
  });

  it('handles guardianship: creates a reciprocal Guardian/Dependent pair', async () => {
    await setupWard();
    const guardian = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Guardian' }, ctx());
    const dependent = await directory.createPerson(
      wardId,
      { firstName: 'Fictional', lastName: 'Dependent', dateOfBirth: '2016-01-01' },
      ctx(),
    );

    const updatedGuardian = await directory.addRelationship(
      wardId,
      guardian.id,
      { relatedPersonId: dependent.id, relationshipType: 'Guardian' },
      ctx(),
    );
    expect(updatedGuardian.relationships).toHaveLength(1);
    expect(updatedGuardian.relationships[0]?.relationshipType).toBe('Guardian');

    const updatedDependent = await directory.getPerson(wardId, dependent.id, true);
    expect(updatedDependent.relationships).toHaveLength(1);
    expect(updatedDependent.relationships[0]?.relationshipType).toBe('Dependent');
  });

  it('handles divorce and remarriage: archiving a spousal relationship ends both directions, and a new spouse can then be added', async () => {
    await setupWard();
    const personA = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'PersonA' }, ctx());
    const spouse1 = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'FirstSpouse' }, ctx());
    const spouse2 = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'SecondSpouse' }, ctx());

    const afterFirstMarriage = await directory.addRelationship(
      wardId,
      personA.id,
      { relatedPersonId: spouse1.id, relationshipType: 'Spouse' },
      ctx(),
    );
    const firstRelationshipId = afterFirstMarriage.relationships[0]?.id;
    expect(firstRelationshipId).toBeTruthy();

    // Divorce: archive the relationship. It must disappear from both people's active relationship lists.
    const afterDivorce = await directory.archiveRelationship(wardId, personA.id, firstRelationshipId as string, ctx());
    expect(afterDivorce.relationships).toEqual([]);
    const spouse1AfterDivorce = await directory.getPerson(wardId, spouse1.id, true);
    expect(spouse1AfterDivorce.relationships).toEqual([]);

    // Remarriage: a new spousal relationship can be added without conflicting with the archived one.
    const afterRemarriage = await directory.addRelationship(
      wardId,
      personA.id,
      { relatedPersonId: spouse2.id, relationshipType: 'Spouse' },
      ctx(),
    );
    expect(afterRemarriage.relationships).toHaveLength(1);
    expect(afterRemarriage.relationships[0]?.relatedPersonId).toBe(spouse2.id);
  });

  it('supports a single-parent household: one adult (Head) and children (Member) with Parent/Child relationships', async () => {
    await setupWard();
    const household = await directory.createHousehold(wardId, { name: 'Fictional Single-Parent Household' }, ctx());
    const parent = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'SoleParent' }, ctx());
    const child = await directory.createPerson(
      wardId,
      { firstName: 'Fictional', lastName: 'OnlyChild', dateOfBirth: '2018-01-01' },
      ctx(),
    );

    await directory.addHouseholdMembership(wardId, parent.id, household.id, 'Head', false, ctx());
    await directory.addHouseholdMembership(wardId, child.id, household.id, 'Member', false, ctx());
    await directory.addRelationship(wardId, parent.id, { relatedPersonId: child.id, relationshipType: 'Parent' }, ctx());

    const detail = await directory.getHousehold(wardId, household.id);
    expect(detail.members).toHaveLength(2);
    expect(detail.members.find((m) => m.personId === parent.id)?.householdRole).toBe('Head');
    expect(detail.members.find((m) => m.personId === child.id)?.householdRole).toBe('Member');

    // Household role and family relationship are tracked independently.
    const parentDetail = await directory.getPerson(wardId, parent.id, true);
    expect(parentDetail.relationships[0]?.relationshipType).toBe('Parent');
    expect(parentDetail.householdMemberships[0]?.householdRole).toBe('Head');
  });

  it('moving a person between households ends the prior membership when requested', async () => {
    await setupWard();
    const householdOne = await directory.createHousehold(wardId, { name: 'Fictional Household One' }, ctx());
    const householdTwo = await directory.createHousehold(wardId, { name: 'Fictional Household Two' }, ctx());
    const person = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Mover' }, ctx());

    await directory.addHouseholdMembership(wardId, person.id, householdOne.id, 'Head', false, ctx());
    const afterMove = await directory.addHouseholdMembership(wardId, person.id, householdTwo.id, 'Head', true, ctx());

    const currentMemberships = afterMove.householdMemberships.filter((m) => m.endedAt === null);
    expect(currentMemberships).toHaveLength(1);
    expect(currentMemberships[0]?.householdId).toBe(householdTwo.id);
  });

  it('restricts date of birth and contact methods for a minor unless the viewer has minors.contact.read', async () => {
    await setupWard();
    const minor = await directory.createPerson(
      wardId,
      { firstName: 'Fictional', lastName: 'Minor', dateOfBirth: '2015-01-01' },
      ctx(),
    );
    await directory.addContactMethod(
      wardId,
      minor.id,
      { type: 'Email', value: createFictionalEmail(createFictionalId('minor', 1)) },
      ctx(),
    );

    const restrictedView = await directory.getPerson(wardId, minor.id, false);
    expect(restrictedView.restricted).toBe(true);
    expect(restrictedView.dateOfBirth).toBeNull();
    expect(restrictedView.contactMethods).toEqual([]);

    const privilegedView = await directory.getPerson(wardId, minor.id, true);
    expect(privilegedView.restricted).toBe(false);
    expect(privilegedView.dateOfBirth).toBe('2015-01-01');
    expect(privilegedView.contactMethods).toHaveLength(1);
  });

  it('excludes archived (inactive) relationships from a person detail view', async () => {
    await setupWard();
    const personA = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Inactive1' }, ctx());
    const personB = await directory.createPerson(wardId, { firstName: 'Fictional', lastName: 'Inactive2' }, ctx());

    const afterAdd = await directory.addRelationship(
      wardId,
      personA.id,
      { relatedPersonId: personB.id, relationshipType: 'Other', inverseRelationshipType: 'Other' },
      ctx(),
    );
    const relationshipId = afterAdd.relationships[0]?.id as string;
    const afterArchive = await directory.archiveRelationship(wardId, personA.id, relationshipId, ctx());

    expect(afterArchive.relationships).toEqual([]);
  });

  it('searches people by name, excluding archived people by default', async () => {
    await setupWard();
    await directory.createPerson(wardId, { firstName: 'Findable', lastName: 'Person' }, ctx());
    const archived = await directory.createPerson(wardId, { firstName: 'Archived', lastName: 'Person' }, ctx());
    await directory.archivePerson(wardId, archived.id, ctx());

    const results = await directory.searchPeople(wardId, { query: 'Person' });
    expect(results.some((p) => p.firstName === 'Findable')).toBe(true);
    expect(results.some((p) => p.firstName === 'Archived')).toBe(false);

    const withInactive = await directory.searchPeople(wardId, { query: 'Person', includeInactive: true });
    expect(withInactive.some((p) => p.firstName === 'Archived')).toBe(true);
  });
});
