import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { UserRepository } from '../auth/repositories/user.repository.js';
import { SessionRepository } from '../auth/repositories/session.repository.js';
import { RoleRepository } from './repositories/role.repository.js';
import { UsersAdminService } from './users-admin.service.js';

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

describe.skipIf(!databaseAvailable)('UsersAdminService — live PostgreSQL integration', () => {
  const audit = new AuditService(prisma);
  const users = new UserRepository(prisma);
  const sessions = new SessionRepository(prisma);
  const roles = new RoleRepository(prisma);
  const passwordHasher = new PasswordHasherService();
  const usersAdmin = new UsersAdminService(users, roles, passwordHasher, sessions, audit);

  const createdWardIds: string[] = [];
  let wardId: string;
  let actorUserId: string;
  let viewerRoleId: string;

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    const ward = await prisma.client.ward.create({
      data: { name: `Fictional Users Ward ${randomUUID()}` },
    });
    createdWardIds.push(ward.id);
    wardId = ward.id;

    const actor = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: `ward.actor.${randomUUID()}`,
        displayName: 'Ward Actor',
        passwordHash: await passwordHasher.hash('Fictional-Actor-Password-42'),
      },
    });
    actorUserId = actor.id;

    const viewer = await prisma.client.role.findUniqueOrThrow({ where: { name: 'Viewer' } });
    viewerRoleId = viewer.id;
  });

  afterEach(async () => {
    for (const id of createdWardIds) {
      await prisma.client.auditEvent.deleteMany({ where: { wardId: id } });
      await prisma.client.userSession.deleteMany({ where: { user: { wardId: id } } });
      await prisma.client.userRole.deleteMany({ where: { user: { wardId: id } } });
      await prisma.client.applicationUser.deleteMany({ where: { wardId: id } });
      await prisma.client.ward.deleteMany({ where: { id } });
    }
    createdWardIds.length = 0;
  });

  it('excludes PlatformAdmin from assignable ward roles', async () => {
    const { roles: listed } = await usersAdmin.listRoles();
    expect(listed.some((role) => role.name === 'PlatformAdmin')).toBe(false);
    expect(listed.some((role) => role.name === 'WardAdmin')).toBe(true);
  });

  it('rejects assigning PlatformAdmin through ward user management', async () => {
    const platformAdmin = await prisma.client.role.findUniqueOrThrow({ where: { name: 'PlatformAdmin' } });
    await expect(
      usersAdmin.create(
        wardId,
        {
          username: `escalated.${randomUUID()}`,
          email: `escalated.${randomUUID()}@example.com`,
          password: 'Fictional-Password-42',
          displayName: 'Should Not Escalate',
          roleIds: [platformAdmin.id],
        },
        { actorUserId, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/PlatformAdmin cannot be assigned/i);
  });

  it('resets a same-ward user password, revokes sessions, and cannot reset another ward', async () => {
    const created = await usersAdmin.create(
      wardId,
      {
        username: `member.${randomUUID()}`,
        email: `member.${randomUUID()}@example.com`,
        password: 'Fictional-Original-42',
        displayName: 'Fictional Member',
        roleIds: [viewerRoleId],
      },
      { actorUserId, ipAddress: '203.0.113.10', userAgent: 'vitest' },
    );

    await sessions.create({
      userId: created.id,
      sessionTokenHash: `hash-${randomUUID()}`,
      deviceId: 'device-1',
      wardCodeVersionId: null,
      ipAddress: null,
      userAgent: null,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await usersAdmin.resetPassword(wardId, created.id, 'Fictional-Reset-99x', {
      actorUserId,
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
    });

    const updated = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: created.id } });
    expect(await passwordHasher.verify(updated.passwordHash, 'Fictional-Reset-99x')).toBe(true);

    const activeSessions = await prisma.client.userSession.count({
      where: { userId: created.id, revokedAt: null },
    });
    expect(activeSessions).toBe(0);

    const otherWard = await prisma.client.ward.create({
      data: { name: `Fictional Other Ward ${randomUUID()}` },
    });
    createdWardIds.push(otherWard.id);
    const otherUser = await prisma.client.applicationUser.create({
      data: {
        wardId: otherWard.id,
        username: `other.${randomUUID()}`,
        displayName: 'Other Ward User',
        passwordHash: await passwordHasher.hash('Fictional-Other-Password-42'),
      },
    });

    await expect(
      usersAdmin.resetPassword(wardId, otherUser.id, 'Fictional-Reset-99x', {
        actorUserId,
        ipAddress: null,
        userAgent: null,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('persists a normalized email and rejects a duplicate in the same ward', async () => {
    const created = await usersAdmin.create(
      wardId,
      {
        username: `email.member.${randomUUID()}`,
        email: '  Jane.Doe@Example.COM  ',
        password: 'Fictional-Password-42',
        displayName: 'Email Member',
        roleIds: [viewerRoleId],
      },
      { actorUserId, ipAddress: '203.0.113.10', userAgent: 'vitest' },
    );

    expect(created.email).toBe('jane.doe@example.com');

    const persisted = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: created.id } });
    expect(persisted.email).toBe('jane.doe@example.com');

    const createdAudit = await prisma.client.auditEvent.findFirst({
      where: { action: 'user.created', entityId: created.id },
    });
    expect(createdAudit).toBeTruthy();
    expect(JSON.stringify(createdAudit?.metadata ?? {})).toMatch(/jane\.doe@example\.com/);

    await expect(
      usersAdmin.create(
        wardId,
        {
          username: `email.other.${randomUUID()}`,
          email: 'jane.doe@example.com',
          password: 'Fictional-Password-42',
          displayName: 'Other Email Member',
          roleIds: [viewerRoleId],
        },
        { actorUserId, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/email already exists/i);
  });

  it('rejects an implausible email at the service boundary', async () => {
    await expect(
      usersAdmin.create(
        wardId,
        {
          username: `bad.email.${randomUUID()}`,
          email: 'not-an-email',
          password: 'Fictional-Password-42',
          displayName: 'Bad Email',
          roleIds: [viewerRoleId],
        },
        { actorUserId, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/valid email/i);
  });
});
