// Live-database integration test for the Phase 3 schema and migration.
//
// Skips automatically (rather than failing) when PostgreSQL is unreachable
// or the migration has not been applied (e.g. sandboxed environments
// without Docker) so `pnpm test` stays green everywhere while still
// providing real coverage wherever a database is available:
//
//   docker compose up -d postgres
//   pnpm --filter @ward-comms/database db:migrate
//   pnpm --filter @ward-comms/database test
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl =
  process.env.DATABASE_URL ?? 'postgresql://ward_comms:ward_comms_dev_password@localhost:5432/ward_comms_dev';

async function isMigratedDatabaseAvailable(): Promise<boolean> {
  const probe = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    await probe.ward.findFirst();
    return true;
  } catch {
    return false;
  } finally {
    await probe.$disconnect();
  }
}

const databaseAvailable = await isMigratedDatabaseAvailable();

describe.skipIf(!databaseAvailable)('Phase 3 schema — live PostgreSQL integration', () => {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  let wardId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const ward = await prisma.ward.create({ data: { name: 'Fictional Test Ward' } });
    wardId = ward.id;
  });

  afterAll(async () => {
    await prisma.ward.deleteMany({ where: { id: wardId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  it('enforces the unique (wardId, username) constraint on ApplicationUser', async () => {
    await prisma.applicationUser.create({
      data: {
        wardId,
        username: 'fictional.user',
        displayName: 'Fictional User',
        passwordHash: 'not-a-real-hash',
      },
    });

    await expect(
      prisma.applicationUser.create({
        data: {
          wardId,
          username: 'fictional.user',
          displayName: 'Duplicate Fictional User',
          passwordHash: 'not-a-real-hash',
        },
      }),
    ).rejects.toThrow();
  });

  it('cascades household membership deletion when the household is removed, but preserves the person', async () => {
    const person = await prisma.person.create({
      data: { wardId, firstName: 'Fictional', lastName: 'Person' },
    });
    const household = await prisma.household.create({
      data: { wardId, name: 'Fictional Household' },
    });
    await prisma.householdMembership.create({
      data: { personId: person.id, householdId: household.id },
    });

    await prisma.household.delete({ where: { id: household.id } });

    const survivingPerson = await prisma.person.findUnique({ where: { id: person.id } });
    expect(survivingPerson).not.toBeNull();

    const remainingMemberships = await prisma.householdMembership.findMany({
      where: { personId: person.id },
    });
    expect(remainingMemberships).toHaveLength(0);
  });

  it('defaults contact consent to Unknown and never auto-grants it', async () => {
    const person = await prisma.person.create({
      data: { wardId, firstName: 'Consent', lastName: 'TestPerson' },
    });
    const contactMethod = await prisma.contactMethod.create({
      data: { personId: person.id, type: 'Email', value: 'consent-test@example.com' },
    });
    const consent = await prisma.contactConsent.create({
      data: { contactMethodId: contactMethod.id },
    });

    expect(consent.status).toBe('Unknown');
  });

  it('preserves an audit event even after the referenced actor user is deleted', async () => {
    const user = await prisma.applicationUser.create({
      data: {
        wardId,
        username: `fictional.audit.${Date.now()}`,
        displayName: 'Fictional Audit Actor',
        passwordHash: 'not-a-real-hash',
      },
    });
    const auditEvent = await prisma.auditEvent.create({
      data: {
        wardId,
        actorUserId: user.id,
        action: 'test.action',
        entityType: 'Test',
      },
    });

    await prisma.applicationUser.delete({ where: { id: user.id } });

    const survivingEvent = await prisma.auditEvent.findUnique({ where: { id: auditEvent.id } });
    expect(survivingEvent).not.toBeNull();
    expect(survivingEvent?.actorUserId).toBeNull();
  });
});
