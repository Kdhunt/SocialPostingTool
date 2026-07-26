// Live-database integration tests for the Phase 6 audience groups.
//
// Skips automatically (rather than failing) when no migrated PostgreSQL
// instance is reachable — see apps/api/src/auth/auth.service.integration.spec.ts
// for the same pattern and the commands to bring one up locally.
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PersonRepository } from '../directory/repositories/person.repository.js';
import { AudiencesService, type AudienceActionContext } from './audiences.service.js';
import { AudienceGroupRepository } from './repositories/audience-group.repository.js';
import { AudienceMemberRepository } from './repositories/audience-member.repository.js';
import { AudienceDestinationRepository } from './repositories/audience-destination.repository.js';
import { CommunicationDestinationRepository } from './repositories/communication-destination.repository.js';

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

describe.skipIf(!databaseAvailable)('AudiencesService — live PostgreSQL integration', () => {
  const audit = new AuditService(prisma);
  const people = new PersonRepository(prisma);
  const groups = new AudienceGroupRepository(prisma);
  const members = new AudienceMemberRepository(prisma);
  const audienceDestinations = new AudienceDestinationRepository(prisma);
  const destinations = new CommunicationDestinationRepository(prisma);
  const audiences = new AudiencesService(groups, members, audienceDestinations, destinations, people, audit);

  let wardId: string;
  let actorUserId: string;

  function ctx(): AudienceActionContext {
    return { actorUserId, ipAddress: '203.0.113.30', userAgent: 'vitest' };
  }

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  async function setupWard(): Promise<void> {
    const ward = await prisma.client.ward.create({ data: { name: `Fictional Audience Ward ${randomUUID()}` } });
    wardId = ward.id;
    const user = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: `fictional.audience.actor.${randomUUID()}`,
        displayName: 'Fictional Audience Actor',
        passwordHash: 'not-a-real-hash',
      },
    });
    actorUserId = user.id;
  }

  async function createFictionalPerson(firstName: string, dateOfBirth: Date | null = new Date('1980-01-01')): Promise<string> {
    const person = await prisma.client.person.create({
      data: { wardId, firstName, lastName: 'Fictional', dateOfBirth },
    });
    return person.id;
  }

  afterEach(async () => {
    if (!wardId) return;
    await prisma.client.auditEvent.deleteMany({ where: { wardId } });
    await prisma.client.audienceDestination.deleteMany({ where: { audienceGroup: { wardId } } });
    await prisma.client.audienceGroupMember.deleteMany({ where: { audienceGroup: { wardId } } });
    await prisma.client.audienceGroup.deleteMany({ where: { wardId } });
    await prisma.client.communicationDestination.deleteMany({ where: { wardId } });
    await prisma.client.person.deleteMany({ where: { wardId } });
    await prisma.client.applicationUser.deleteMany({ where: { wardId } });
    await prisma.client.ward.deleteMany({ where: { id: wardId } });
  });

  it('creates an audience group with a ward-chosen name — no name is hardcoded anywhere in the service', async () => {
    await setupWard();
    const group = await audiences.create(wardId, { name: 'Whatever this ward decides to call it' }, ctx());
    expect(group.name).toBe('Whatever this ward decides to call it');
    expect(group.members).toEqual([]);
    expect(group.isActive).toBe(true);
  });

  it('rejects creating a second audience with the same name in the same ward', async () => {
    await setupWard();
    await audiences.create(wardId, { name: 'Duplicate Name' }, ctx());
    await expect(audiences.create(wardId, { name: 'Duplicate Name' }, ctx())).rejects.toThrow();
  });

  it('renames an audience group', async () => {
    await setupWard();
    const group = await audiences.create(wardId, { name: 'Original Name' }, ctx());
    const renamed = await audiences.update(wardId, group.id, { name: 'Renamed Group' }, ctx());
    expect(renamed.name).toBe('Renamed Group');
  });

  it('adds a manual member and detects a duplicate add as a conflict rather than a duplicate row', async () => {
    await setupWard();
    const group = await audiences.create(wardId, { name: 'Group With Members' }, ctx());
    const personId = await createFictionalPerson('Adult');

    const withMember = await audiences.addMember(wardId, group.id, { personId }, ctx());
    expect(withMember.members).toHaveLength(1);
    expect(withMember.members[0]?.personId).toBe(personId);

    await expect(audiences.addMember(wardId, group.id, { personId }, ctx())).rejects.toThrow();
  });

  it('flags minors correctly in audience membership using the shared minor-access age rule', async () => {
    await setupWard();
    const group = await audiences.create(wardId, { name: 'Mixed Age Group' }, ctx());
    const minorPersonId = await createFictionalPerson('Minor', new Date('2015-01-01'));
    const adultPersonId = await createFictionalPerson('Adult', new Date('1980-01-01'));

    await audiences.addMember(wardId, group.id, { personId: minorPersonId }, ctx());
    await audiences.addMember(wardId, group.id, { personId: adultPersonId }, ctx());

    const detail = await audiences.get(wardId, group.id);
    const minor = detail.members.find((m) => m.personId === minorPersonId);
    const adult = detail.members.find((m) => m.personId === adultPersonId);
    expect(minor?.isMinor).toBe(true);
    expect(adult?.isMinor).toBe(false);
  });

  it('removes a member', async () => {
    await setupWard();
    const group = await audiences.create(wardId, { name: 'Group To Shrink' }, ctx());
    const personId = await createFictionalPerson('Adult');
    await audiences.addMember(wardId, group.id, { personId }, ctx());

    const afterRemoval = await audiences.removeMember(wardId, group.id, personId, ctx());
    expect(afterRemoval.members).toEqual([]);
  });

  it('refuses to hard-delete an audience group that still has members, but allows archiving it', async () => {
    await setupWard();
    const group = await audiences.create(wardId, { name: 'Group With A Member' }, ctx());
    const personId = await createFictionalPerson('Adult');
    await audiences.addMember(wardId, group.id, { personId }, ctx());

    await expect(audiences.delete(wardId, group.id, ctx())).rejects.toThrow(/members/);

    await audiences.archive(wardId, group.id, ctx());
    const archived = await audiences.get(wardId, group.id);
    expect(archived.isActive).toBe(false);
  });

  it('safely hard-deletes an audience group with no members and no destinations', async () => {
    await setupWard();
    const group = await audiences.create(wardId, { name: 'Never Used Group' }, ctx());
    await audiences.delete(wardId, group.id, ctx());
    await expect(audiences.get(wardId, group.id)).rejects.toThrow();
  });

  it('links and unlinks a communication destination, and refuses hard-delete while linked', async () => {
    await setupWard();
    const group = await audiences.create(wardId, { name: 'Group With Destination' }, ctx());
    const destination = await audiences.createDestination(wardId, { name: 'Fictional Ward Email List', channel: 'Email' }, ctx());

    const withDestination = await audiences.addDestination(wardId, group.id, { destinationId: destination.id }, ctx());
    expect(withDestination.destinations).toHaveLength(1);

    await expect(audiences.delete(wardId, group.id, ctx())).rejects.toThrow(/destination/);

    const withoutDestination = await audiences.removeDestination(wardId, group.id, destination.id, ctx());
    expect(withoutDestination.destinations).toEqual([]);
  });

  it('previews deduplicated membership across overlapping audiences without double-counting a shared member', async () => {
    await setupWard();
    const groupA = await audiences.create(wardId, { name: 'Overlap Group A' }, ctx());
    const groupB = await audiences.create(wardId, { name: 'Overlap Group B' }, ctx());
    const sharedPersonId = await createFictionalPerson('Shared');
    const onlyInAPersonId = await createFictionalPerson('OnlyInA');

    await audiences.addMember(wardId, groupA.id, { personId: sharedPersonId }, ctx());
    await audiences.addMember(wardId, groupA.id, { personId: onlyInAPersonId }, ctx());
    await audiences.addMember(wardId, groupB.id, { personId: sharedPersonId }, ctx());

    const preview = await audiences.preview(wardId, [groupA.id, groupB.id]);
    expect(preview.totalCount).toBe(2);
    expect(preview.overlapCount).toBe(1);
    const shared = preview.members.find((m) => m.personId === sharedPersonId);
    expect(shared?.audienceGroupIds.sort()).toEqual([groupA.id, groupB.id].sort());
  });

  it('searches audience groups by name and filters archived groups out by default', async () => {
    await setupWard();
    await audiences.create(wardId, { name: 'Findable Fictional Group' }, ctx());
    const toArchive = await audiences.create(wardId, { name: 'Archived Fictional Group' }, ctx());
    await audiences.archive(wardId, toArchive.id, ctx());

    const activeOnly = await audiences.search(wardId, {});
    expect(activeOnly.map((g) => g.name)).toContain('Findable Fictional Group');
    expect(activeOnly.map((g) => g.name)).not.toContain('Archived Fictional Group');

    const includingArchived = await audiences.search(wardId, { includeArchived: true });
    expect(includingArchived.map((g) => g.name)).toContain('Archived Fictional Group');

    const filtered = await audiences.search(wardId, { query: 'Findable' });
    expect(filtered.map((g) => g.name)).toEqual(['Findable Fictional Group']);
  });
});
