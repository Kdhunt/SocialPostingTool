import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '@ward-comms/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { WardCodeHasherService } from '../auth/ward-code-hasher.service.js';
import { UserRepository } from '../auth/repositories/user.repository.js';
import { SessionRepository } from '../auth/repositories/session.repository.js';
import { WardCodeRepository } from '../auth/repositories/ward-code.repository.js';
import { WardProvisioningService } from './ward-provisioning.service.js';
import { WardAdminService } from './ward-admin.service.js';
import { UsersAdminService } from './users-admin.service.js';
import { RoleRepository } from './repositories/role.repository.js';
import { WardRepository } from './repositories/ward.repository.js';

function fakeConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    appName: 'Ward Communications Hub',
    wardTimeZone: 'America/Denver',
    api: { host: '0.0.0.0', port: 3001, url: 'http://localhost:3001' },
    web: { port: 3000, url: 'http://localhost:3000' },
    worker: { healthPort: 3002, schedulePollIntervalMs: 60_000 },
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: 'redis://localhost:6379',
    session: { secret: 'a'.repeat(32), refreshTokenSecret: 'b'.repeat(32) },
    wardCodePepper: 'fictional-pepper-value',
    providerCredentialsEncryptionKey: 'dev-only-provider-credentials-key!!',
    providerMode: 'simulated',
    openAiApiKey: undefined,
    aiImageMode: 'simulated',
    corsAllowedOrigins: ['http://localhost:3000'],
  };
}

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

describe.skipIf(!databaseAvailable)('WardProvisioningService — live PostgreSQL integration', () => {
  const config = fakeConfig();
  const audit = new AuditService(prisma);
  const wards = new WardRepository(prisma);
  const roles = new RoleRepository(prisma);
  const passwordHasher = new PasswordHasherService();
  const wardCodeHasher = new WardCodeHasherService(config);
  const users = new UserRepository(prisma);
  const sessions = new SessionRepository(prisma);
  const wardCodes = new WardCodeRepository(prisma);
  const wardAdmin = new WardAdminService(wardCodes, wardCodeHasher, audit);
  const usersAdmin = new UsersAdminService(users, roles, passwordHasher, sessions, audit);
  const provisioning = new WardProvisioningService(
    prisma,
    wards,
    roles,
    users,
    passwordHasher,
    wardCodeHasher,
    wardAdmin,
    usersAdmin,
    audit,
  );

  let actorUserId: string;
  const createdWardIds: string[] = [];

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    const actorWard = await prisma.client.ward.create({
      data: { name: `Fictional Actor Ward ${randomUUID()}` },
    });
    createdWardIds.push(actorWard.id);

    const actor = await prisma.client.applicationUser.create({
      data: {
        wardId: actorWard.id,
        username: `platform.actor.${randomUUID()}`,
        displayName: 'Platform Actor',
        passwordHash: await passwordHasher.hash('Fictional-Actor-Password-42'),
      },
    });
    actorUserId = actor.id;
  });

  it('creates a ward with bootstrap admin and initial ward code version', async () => {
    const wardName = `Fictional Provisioned Ward ${randomUUID()}`;
    const result = await provisioning.create(
      {
        name: wardName,
        timeZone: 'America/Denver',
        adminUsername: 'bootstrap.admin',
        adminEmail: '  Bootstrap.Admin@Example.COM  ',
        adminDisplayName: 'Bootstrap Admin',
        adminPassword: 'Fictional-Bootstrap-42',
        initialWardCode: 'fictional-bootstrap-code',
      },
      { actorUserId, ipAddress: '203.0.113.10', userAgent: 'vitest' },
    );

    createdWardIds.push(result.ward.id);

    expect(result.ward.name).toBe(wardName);
    expect(result.adminUsername).toBe('bootstrap.admin');
    expect(result.adminEmail).toBe('bootstrap.admin@example.com');
    expect(result).not.toHaveProperty('adminPassword');
    expect(result).not.toHaveProperty('initialWardCode');

    const adminUser = await prisma.client.applicationUser.findUniqueOrThrow({
      where: { id: result.adminUserId },
      include: { roles: { include: { role: true } } },
    });
    expect(adminUser.wardId).toBe(result.ward.id);
    expect(adminUser.email).toBe('bootstrap.admin@example.com');
    expect(adminUser.roles.some((userRole) => userRole.role.name === 'WardAdmin')).toBe(true);

    const activeCode = await prisma.client.wardCodeVersion.findFirst({
      where: { wardId: result.ward.id, retiredAt: null },
    });
    expect(activeCode?.version).toBe(1);

    const passwordValid = await passwordHasher.verify(adminUser.passwordHash, 'Fictional-Bootstrap-42');
    expect(passwordValid).toBe(true);

    const codeValid = await wardCodeHasher.verify(activeCode!.codeHash, 'fictional-bootstrap-code');
    expect(codeValid).toBe(true);
  });

  it('rejects duplicate active ward names', async () => {
    const wardName = `Fictional Duplicate Ward ${randomUUID()}`;
    const first = await provisioning.create(
      {
        name: wardName,
        adminUsername: 'first.admin',
        adminEmail: 'first.admin@example.com',
        adminDisplayName: 'First Admin',
        adminPassword: 'Fictional-Bootstrap-42',
        initialWardCode: 'fictional-bootstrap-code',
      },
      { actorUserId, ipAddress: null, userAgent: null },
    );
    createdWardIds.push(first.ward.id);

    await expect(
      provisioning.create(
        {
          name: wardName,
          adminUsername: 'second.admin',
          adminEmail: 'second.admin@example.com',
          adminDisplayName: 'Second Admin',
          adminPassword: 'Fictional-Bootstrap-42',
          initialWardCode: 'another-bootstrap-code',
        },
        { actorUserId, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/already exists/i);
  });

  it('lists provisioned wards with their WardAdmin accounts', async () => {
    const wardName = `Fictional Listed Ward ${randomUUID()}`;
    const created = await provisioning.create(
      {
        name: wardName,
        adminUsername: 'listed.admin',
        adminEmail: 'listed.admin@example.com',
        adminDisplayName: 'Listed Admin',
        adminPassword: 'Fictional-Bootstrap-42',
        initialWardCode: 'fictional-listed-code',
      },
      { actorUserId, ipAddress: null, userAgent: null },
    );
    createdWardIds.push(created.ward.id);

    const { wards } = await provisioning.list();
    const listed = wards.find((ward) => ward.id === created.ward.id);
    expect(listed?.admins).toEqual([
      expect.objectContaining({
        id: created.adminUserId,
        username: 'listed.admin',
        email: 'listed.admin@example.com',
        displayName: 'Listed Admin',
      }),
    ]);
  });

  it('rotates another ward code and resets that ward admin password', async () => {
    const created = await provisioning.create(
      {
        name: `Fictional Rotate Ward ${randomUUID()}`,
        adminUsername: 'rotate.admin',
        adminEmail: 'rotate.admin@example.com',
        adminDisplayName: 'Rotate Admin',
        adminPassword: 'Fictional-Bootstrap-42',
        initialWardCode: 'fictional-original-code',
      },
      { actorUserId, ipAddress: '203.0.113.10', userAgent: 'vitest' },
    );
    createdWardIds.push(created.ward.id);

    const rotated = await provisioning.rotateWardCode(
      created.ward.id,
      { newWardCode: 'fictional-rotated-code' },
      { actorUserId, ipAddress: '203.0.113.10', userAgent: 'vitest' },
    );
    expect(rotated.version).toBe(2);

    const activeCode = await prisma.client.wardCodeVersion.findFirst({
      where: { wardId: created.ward.id, retiredAt: null },
    });
    expect(await wardCodeHasher.verify(activeCode!.codeHash, 'fictional-rotated-code')).toBe(true);

    await provisioning.resetWardAdminPassword(
      created.ward.id,
      created.adminUserId,
      'Fictional-Reset-Password-42',
      { actorUserId, ipAddress: '203.0.113.10', userAgent: 'vitest' },
    );

    const adminUser = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: created.adminUserId } });
    expect(await passwordHasher.verify(adminUser.passwordHash, 'Fictional-Reset-Password-42')).toBe(true);

    const resetAudit = await prisma.client.auditEvent.findFirst({
      where: { action: 'user.password_reset', entityId: created.adminUserId },
    });
    expect(resetAudit).toBeTruthy();
    expect(JSON.stringify(resetAudit?.metadata ?? {})).not.toMatch(/Fictional-Reset-Password-42/);
  });

  it('rejects an implausible initial admin email', async () => {
    await expect(
      provisioning.create(
        {
          name: `Fictional Invalid Email Ward ${randomUUID()}`,
          adminUsername: 'bad.email.admin',
          adminEmail: 'not-an-email',
          adminDisplayName: 'Bad Email Admin',
          adminPassword: 'Fictional-Bootstrap-42',
          initialWardCode: 'fictional-bootstrap-code',
        },
        { actorUserId, ipAddress: null, userAgent: null },
      ),
    ).rejects.toThrow(/valid email/i);
  });

  it('does not grant platform.wards.manage to the WardAdmin role', async () => {
    const wardAdminRole = await prisma.client.role.findUniqueOrThrow({
      where: { name: 'WardAdmin' },
      include: { rolePermissions: { include: { permission: true } } },
    });
    expect(wardAdminRole.rolePermissions.some((row) => row.permission.key === 'platform.wards.manage')).toBe(false);
  });

  afterEach(async () => {
    for (const wardId of createdWardIds) {
      await prisma.client.auditEvent.deleteMany({ where: { wardId } });
      await prisma.client.userSession.deleteMany({ where: { user: { wardId } } });
      await prisma.client.userRole.deleteMany({ where: { user: { wardId } } });
      await prisma.client.applicationUser.deleteMany({ where: { wardId } });
      await prisma.client.wardCodeVersion.deleteMany({ where: { wardId } });
      await prisma.client.ward.deleteMany({ where: { id: wardId } });
    }
    createdWardIds.length = 0;
  });
});
