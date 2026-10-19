// Live-database integration tests for bulletins and unit organizations.
// Skips automatically when no migrated PostgreSQL is reachable; see
// apps/api/src/auth/auth.service.integration.spec.ts for local setup.
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_UNIT_ORGANIZATIONS } from '@ward-comms/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { WardRepository } from '../admin/repositories/ward.repository.js';
import { BulletinRepository } from './repositories/bulletin.repository.js';
import { UnitOrganizationRepository } from './repositories/unit-organization.repository.js';
import { BulletinsService, type BulletinActionContext } from './bulletins.service.js';
import { UnitOrganizationsService } from './unit-organizations.service.js';

async function isMigratedDatabaseAvailable(prisma: PrismaService): Promise<boolean> {
  try {
    await prisma.client.bulletin.findFirst();
    return true;
  } catch {
    return false;
  }
}

const prisma = new PrismaService();
await prisma.onModuleInit().catch(() => undefined);
const databaseAvailable = await isMigratedDatabaseAvailable(prisma);

describe.skipIf(!databaseAvailable)('BulletinsService — live PostgreSQL integration', () => {
  const audit = new AuditService(prisma);
  const organizationsRepo = new UnitOrganizationRepository(prisma);
  const bulletins = new BulletinsService(
    new BulletinRepository(prisma),
    organizationsRepo,
    new WardRepository(prisma),
    audit,
  );
  const organizations = new UnitOrganizationsService(organizationsRepo, audit);

  const createdWardIds: string[] = [];
  let wardId: string;
  let wardSlug: string;
  let actorUserId: string;

  const editor = (): BulletinActionContext => ({
    actorUserId,
    permissions: ['campaigns.create'],
    ipAddress: null,
    userAgent: null,
  });
  const publisher = (): BulletinActionContext => ({
    ...editor(),
    permissions: ['campaigns.create', 'campaigns.send'],
  });

  async function makeUnit(name: string): Promise<{ id: string; slug: string }> {
    const slug = `b${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const ward = await prisma.client.ward.create({
      data: { name, publicSlug: slug, timeZone: 'America/Denver' },
    });
    await prisma.client.$transaction((tx) =>
      UnitOrganizationRepository.createDefaults(tx, ward.id),
    );
    createdWardIds.push(ward.id);
    return { id: ward.id, slug };
  }

  const section = (overrides: Record<string, unknown> = {}) => ({
    column: 'Main' as const,
    heading: 'Stake conference is coming!',
    subheading: 'November 7th and 8th',
    bodyHtml: '<p>Temple cleaning and grounds work.</p>',
    ...overrides,
  });

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    const unit = await makeUnit(`Fictional North Stake ${randomUUID().slice(0, 8)}`);
    wardId = unit.id;
    wardSlug = unit.slug;
    const actor = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: `clerk.${randomUUID()}`,
        displayName: 'Fictional Clerk',
        passwordHash: 'x',
      },
    });
    actorUserId = actor.id;
  });

  afterEach(async () => {
    for (const id of [...createdWardIds].reverse()) {
      await prisma.client.auditEvent.deleteMany({ where: { wardId: id } });
      await prisma.client.bulletin.deleteMany({
        where: { wardId: id, translationOfId: { not: null } },
      });
      await prisma.client.bulletin.deleteMany({ where: { wardId: id } });
      await prisma.client.unitOrganization.deleteMany({ where: { wardId: id } });
      await prisma.client.applicationUser.deleteMany({ where: { wardId: id } });
      await prisma.client.ward.deleteMany({ where: { id } });
    }
    createdWardIds.length = 0;
  });

  it('gives new units the default organizations', async () => {
    const { organizations: list } = await organizations.list(wardId);
    expect(list.map((org) => org.name)).toEqual([...DEFAULT_UNIT_ORGANIZATIONS]);
  });

  it('creates a draft titled after the unit, dated today in the unit time zone', async () => {
    const created = await bulletins.create(wardId, {}, editor());
    expect(created.title).toMatch(/^Fictional North Stake .* News$/);
    expect(created.status).toBe('Draft');
    expect(created.template).toBe('Newsletter');
    expect(created.issueDate).toBe(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date()),
    );
    expect(created.unitSlug).toBe(wardSlug);
  });

  it('saves sections in order per column and sanitizes their HTML', async () => {
    const { organizations: orgs } = await organizations.list(wardId);
    const relief = orgs.find((org) => org.name === 'Relief Society')!;
    const created = await bulletins.create(wardId, {}, editor());
    const saved = await bulletins.save(
      wardId,
      created.id,
      {
        title: 'Denver North Stake News',
        kicker: 'Fictional kicker line',
        issueDate: '2026-10-15',
        template: 'Newsletter',
        language: 'en',
        sections: [
          section({
            bodyHtml:
              '<p onclick="x()">Hi<script>alert(1)</script></p><a href="javascript:x">bad</a>',
          }),
          section({ column: 'Side', heading: 'FYI', organizationId: relief.id }),
          section({
            heading: 'Blood drive',
            imageUrl: 'https://example.org/heart.png',
            imageAltText: 'Hands holding a heart',
          }),
        ],
      },
      editor(),
    );
    expect(saved.sections.map((s) => [s.column, s.sortOrder, s.heading])).toEqual([
      ['Main', 0, 'Stake conference is coming!'],
      ['Main', 1, 'Blood drive'],
      ['Side', 0, 'FYI'],
    ]);
    expect(saved.sections[0]!.bodyHtml).toBe(
      '<p>Hi</p><a rel="noopener noreferrer" target="_blank">bad</a>',
    );
    expect(saved.sections[2]!.organizationName).toBe('Relief Society');
    expect(saved.kicker).toBe('Fictional kicker line');
    expect(saved.issueDate).toBe('2026-10-15');
  });

  it('refuses another unit’s organization and hides bulletins from other units', async () => {
    const other = await makeUnit(`Fictional Other Stake ${randomUUID().slice(0, 8)}`);
    const { organizations: otherOrgs } = await organizations.list(other.id);
    const created = await bulletins.create(wardId, {}, editor());
    await expect(
      bulletins.save(
        wardId,
        created.id,
        {
          title: 'T',
          issueDate: '2026-10-15',
          template: 'Newsletter',
          language: 'en',
          sections: [section({ organizationId: otherOrgs[0]!.id })],
        },
        editor(),
      ),
    ).rejects.toThrow(/not available/i);
    await expect(bulletins.get(other.id, created.id)).rejects.toThrow(/not found/i);
  });

  it('publishes only complete bulletins, and the public page serves only published ones by slug', async () => {
    const created = await bulletins.create(wardId, {}, editor());
    await expect(bulletins.publish(wardId, created.id, publisher())).rejects.toThrow(
      /at least one section/i,
    );
    await expect(bulletins.getPublic(wardId, created.id)).rejects.toThrow(/not found/i);

    await bulletins.save(
      wardId,
      created.id,
      {
        title: 'Stake News',
        issueDate: '2026-10-15',
        template: 'Newsletter',
        language: 'en',
        sections: [section()],
      },
      editor(),
    );
    const published = await bulletins.publish(wardId, created.id, publisher());
    expect(published.status).toBe('Published');
    expect(published.publishedAt).not.toBeNull();

    const page = await bulletins.getPublic(wardId, created.id);
    expect(page.unitSlug).toBe(wardSlug);
    expect(page.sections[0]).not.toHaveProperty('organizationId');
    expect((await bulletins.listPublic(wardId)).bulletins.map((b) => b.id)).toEqual([created.id]);

    const audit = await prisma.client.auditEvent.findFirst({
      where: { wardId, action: 'bulletin.published' },
    });
    expect(audit?.entityId).toBe(created.id);
  });

  it('only publishers can edit or remove a live bulletin', async () => {
    const created = await bulletins.create(wardId, {}, editor());
    const body = {
      title: 'Stake News',
      issueDate: '2026-10-15',
      template: 'Newsletter' as const,
      language: 'en',
      sections: [section()],
    };
    await bulletins.save(wardId, created.id, body, editor());
    await bulletins.publish(wardId, created.id, publisher());

    await expect(bulletins.save(wardId, created.id, body, editor())).rejects.toThrow(/live/i);
    await expect(bulletins.archive(wardId, created.id, editor())).rejects.toThrow(/live/i);
    await expect(
      bulletins.save(wardId, created.id, { ...body, title: 'Updated' }, publisher()),
    ).resolves.toMatchObject({
      title: 'Updated',
    });
    await bulletins.archive(wardId, created.id, publisher());
    await expect(bulletins.getPublic(wardId, created.id)).rejects.toThrow(/not found/i);
  });

  it('copies a bulletin into another language edition, linked to the original', async () => {
    const created = await bulletins.create(wardId, {}, editor());
    await bulletins.save(
      wardId,
      created.id,
      {
        title: 'Stake News',
        issueDate: '2026-10-15',
        template: 'Newsletter',
        language: 'en',
        sections: [section(), section({ column: 'Side' })],
      },
      editor(),
    );
    const spanish = await bulletins.copyAsLanguage(wardId, created.id, 'es', editor());
    expect(spanish.language).toBe('es');
    expect(spanish.translationOfId).toBe(created.id);
    expect(spanish.status).toBe('Draft');
    expect(spanish.sections).toHaveLength(2);
    expect(spanish.editions.map((e) => e.language).sort()).toEqual(['en', 'es']);
    await expect(bulletins.copyAsLanguage(wardId, spanish.id, 'en', editor())).rejects.toThrow(
      /already has an edition/i,
    );

    // Readers only see published editions.
    await bulletins.publish(wardId, created.id, publisher());
    expect((await bulletins.getPublic(wardId, created.id)).editions.map((e) => e.language)).toEqual(
      ['en'],
    );
  });

  it('adds, renames and archives organizations without duplicates', async () => {
    const elders = await organizations.create(wardId, '  Elders   Quorum ', editor());
    expect(elders.name).toBe('Elders Quorum');
    expect(elders.sortOrder).toBe(DEFAULT_UNIT_ORGANIZATIONS.length);
    await expect(organizations.create(wardId, 'primary', editor())).rejects.toThrow(
      /already exists/i,
    );
    const renamed = await organizations.rename(wardId, elders.id, 'Elders', editor());
    expect(renamed.name).toBe('Elders');
    await organizations.archive(wardId, elders.id, editor());
    expect(
      (await organizations.list(wardId)).organizations.some((org) => org.id === elders.id),
    ).toBe(false);
  });
});
