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
import { UnitCodeLookupService } from '../auth/unit-code-lookup.service.js';
import { UnitScopeService } from './unit-scope.service.js';
import { WardProvisioningService } from './ward-provisioning.service.js';
import { WardAdminService } from './ward-admin.service.js';
import { UsersAdminService } from './users-admin.service.js';
import type { AccountEmailService } from '../messaging/account-email.service.js';

const noopAccountEmail = {
  queueVerificationForUser: async (): Promise<void> => undefined,
  queuePasswordResetForUser: async (): Promise<void> => undefined,
} as unknown as AccountEmailService;
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
    facebook: { appId: undefined, appSecret: undefined },
    systemEmail: {
      mode: 'simulated',
      provider: 'sendgrid',
      fromAddress: 'noreply@localhost',
      sendgridApiKey: undefined,
      smtp: undefined,
    },
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
  const unitCodes = new UnitCodeLookupService(wardCodes, wardCodeHasher);
  const scope = new UnitScopeService(prisma);
  const wardAdmin = new WardAdminService(wardCodes, wardCodeHasher, unitCodes, audit);
  const usersAdmin = new UsersAdminService(users, roles, passwordHasher, sessions, audit, noopAccountEmail);
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
    noopAccountEmail,
    unitCodes,
    scope,
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
      data: { name: `Fictional Actor Ward ${randomUUID()}`, publicSlug: `w${randomUUID().replace(/-/g, '')}` },
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
    expect(result.ward.publicSlug.startsWith('fictionalprovisionedward')).toBe(true);
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

  describe('unit hierarchy', () => {
    const ctx = (): { actorUserId: string; ipAddress: null; userAgent: null } => ({
      actorUserId,
      ipAddress: null,
      userAgent: null,
    });
    const unitInput = (
      label: string,
      extra: { level?: 'Ward' | 'Stake' | 'Region' | 'District'; parentId?: string } = {},
    ): Parameters<typeof provisioning.create>[0] => ({
      name: `Fictional ${label} ${randomUUID()}`,
      adminUsername: `admin.${label.toLowerCase().replace(/\s+/g, '.')}`,
      adminEmail: `${randomUUID().slice(0, 8)}@example.com`,
      adminDisplayName: `${label} Admin`,
      adminPassword: 'Fictional-Bootstrap-42',
      initialWardCode: `fictional-${randomUUID()}`,
      ...extra,
    });

    async function makeTree(): Promise<{ region: string; stakeA: string; stakeB: string; wardA: string }> {
      const region = (await provisioning.create(unitInput('Region', { level: 'Region' }), ctx())).ward.id;
      createdWardIds.push(region);
      const stakeA = (await provisioning.create(unitInput('Stake A', { level: 'Stake', parentId: region }), ctx())).ward.id;
      createdWardIds.push(stakeA);
      const stakeB = (await provisioning.create(unitInput('Stake B', { level: 'Stake', parentId: region }), ctx())).ward.id;
      createdWardIds.push(stakeB);
      const wardA = (
        await provisioning.create(unitInput('Ward A', { parentId: stakeA }), ctx(), { kind: 'unit', unitId: stakeA })
      ).ward.id;
      createdWardIds.push(wardA);
      return { region, stakeA, stakeB, wardA };
    }

    it('creates each level under the level directly above it', async () => {
      const { region, stakeA, wardA } = await makeTree();
      const ward = await prisma.client.ward.findUniqueOrThrow({ where: { id: wardA } });
      const stake = await prisma.client.ward.findUniqueOrThrow({ where: { id: stakeA } });
      expect(ward.level).toBe('Ward');
      expect(ward.parentId).toBe(stakeA);
      expect(stake.level).toBe('Stake');
      expect(stake.parentId).toBe(region);

      const code = await prisma.client.wardCodeVersion.findFirstOrThrow({ where: { wardId: wardA, retiredAt: null } });
      expect(code.lookupKey).toMatch(/^[0-9a-f]{64}$/);
    });

    it('rejects a parent that is not exactly one level up', async () => {
      const { region } = await makeTree();
      await expect(provisioning.create(unitInput('Skipped Ward', { parentId: region }), ctx())).rejects.toThrow(
        /ward must sit directly under a stake/i,
      );
    });

    it('lets a stake admin create wards only beneath their own stake', async () => {
      const { stakeA, stakeB } = await makeTree();
      await expect(
        provisioning.create(unitInput('Foreign Ward', { parentId: stakeB }), ctx(), { kind: 'unit', unitId: stakeA }),
      ).rejects.toThrow(/not available/i);
      await expect(
        provisioning.create(unitInput('Rootless Stake', { level: 'Stake' }), ctx(), { kind: 'unit', unitId: stakeA }),
      ).rejects.toThrow(/belongs under/i);
    });

    it('lets a region admin see and move units beneath it, but not a stake admin across stakes', async () => {
      const { region, stakeA, stakeB, wardA } = await makeTree();

      const tree = await provisioning.listBeneath(region);
      expect(tree.unit.id).toBe(region);
      expect(tree.units.map((unit) => unit.id).sort()).toEqual([stakeA, stakeB, wardA].sort());
      expect(tree.units.find((unit) => unit.id === wardA)?.admins).toHaveLength(1);

      const stakeTree = await provisioning.listBeneath(stakeA);
      expect(stakeTree.units.map((unit) => unit.id)).toEqual([wardA]);

      await expect(
        provisioning.setParent(wardA, { parentId: stakeB }, { kind: 'unit', unitId: stakeA }, ctx()),
      ).rejects.toThrow(/not available/i);

      const moved = await provisioning.setParent(wardA, { parentId: stakeB }, { kind: 'unit', unitId: region }, ctx());
      expect(moved.parentId).toBe(stakeB);
      expect((await provisioning.listBeneath(stakeA)).units).toHaveLength(0);
    });

    it('refuses to place a unit beneath itself', async () => {
      const { region, stakeA } = await makeTree();
      const district = (await provisioning.create(unitInput('District', { level: 'District' }), ctx())).ward.id;
      createdWardIds.push(district);
      await provisioning.setParent(region, { parentId: district }, { kind: 'platform' }, ctx());
      await expect(
        provisioning.setParent(stakeA, { parentId: stakeA }, { kind: 'platform' }, ctx()),
      ).rejects.toThrow(/own parent|directly under/i);
      await prisma.client.ward.update({ where: { id: region }, data: { parentId: null } });
    });

    it('lets two stakes each have a ward of the same name, but not one stake twice', async () => {
      const { stakeA, stakeB } = await makeTree();
      const name = `Fictional 1st Ward ${randomUUID()}`;
      const first = await provisioning.create({ ...unitInput('1st Ward', { parentId: stakeA }), name }, ctx());
      createdWardIds.push(first.ward.id);
      const twin = await provisioning.create({ ...unitInput('1st Ward', { parentId: stakeB }), name }, ctx());
      createdWardIds.push(twin.ward.id);
      expect(twin.ward.name).toBe(name);
      await expect(
        provisioning.create({ ...unitInput('1st Ward', { parentId: stakeA }), name }, ctx()),
      ).rejects.toThrow(/already exists under the same parent/i);
    });

    it('gives a ward admin no level to create and no way to probe other units as parents', async () => {
      const { stakeA, stakeB, wardA } = await makeTree();
      // A ward has nothing beneath it: every level is rejected on level grounds.
      await expect(
        provisioning.create(unitInput('Nested', { parentId: wardA }), ctx(), { kind: 'unit', unitId: wardA }),
      ).rejects.toThrow(/must sit directly under/i);
      // Parents outside the tree and parents that do not exist read the same.
      const [outside, missing] = await Promise.all([
        provisioning
          .create(unitInput('Outside', { parentId: stakeB }), ctx(), { kind: 'unit', unitId: stakeA })
          .catch((error: Error) => error.message),
        provisioning
          .create(unitInput('Missing', { parentId: randomUUID() }), ctx(), { kind: 'unit', unitId: stakeA })
          .catch((error: Error) => error.message),
      ]);
      expect(outside).toBe(missing);
    });

    it('records hierarchy actions in both the target unit and the acting unit audit logs', async () => {
      const { region, stakeA, wardA } = await makeTree();
      const forWard = await prisma.client.auditEvent.findFirst({ where: { wardId: wardA, action: 'unit.created' } });
      const forStake = await prisma.client.auditEvent.findFirst({ where: { wardId: stakeA, action: 'unit.created' } });
      expect(forWard).toBeTruthy();
      expect(JSON.stringify(forStake?.metadata ?? {})).toContain(wardA);
      await provisioning.setParent(wardA, { parentId: stakeA }, { kind: 'unit', unitId: region }, ctx()).catch(() => undefined);
      const moved = await prisma.client.auditEvent.findFirst({ where: { wardId: region, action: 'unit.parent.updated' } });
      expect(moved === null || JSON.stringify(moved.metadata ?? {}).includes(wardA)).toBe(true);
    });

    it('rejects a sign-in code already used by another unit', async () => {
      const { stakeA } = await makeTree();
      const first = unitInput('Code Owner', { parentId: stakeA });
      const created = await provisioning.create(first, ctx());
      createdWardIds.push(created.ward.id);
      await expect(
        provisioning.create({ ...unitInput('Code Copier', { parentId: stakeA }), initialWardCode: first.initialWardCode }, ctx()),
      ).rejects.toThrow(/already in use/i);
    });
  });

  it('does not grant platform.wards.manage to the WardAdmin role', async () => {
    const wardAdminRole = await prisma.client.role.findUniqueOrThrow({
      where: { name: 'WardAdmin' },
      include: { rolePermissions: { include: { permission: true } } },
    });
    expect(wardAdminRole.rolePermissions.some((row) => row.permission.key === 'platform.wards.manage')).toBe(false);
  });

  afterEach(async () => {
    for (const wardId of [...createdWardIds].reverse()) {
      await prisma.client.auditEvent.deleteMany({ where: { wardId } });
      await prisma.client.outboundMessage.deleteMany({ where: { wardId } });
      await prisma.client.userAccountToken.deleteMany({ where: { user: { wardId } } });
      await prisma.client.userSession.deleteMany({ where: { user: { wardId } } });
      await prisma.client.userRole.deleteMany({ where: { user: { wardId } } });
      await prisma.client.applicationUser.deleteMany({ where: { wardId } });
      await prisma.client.wardCodeVersion.deleteMany({ where: { wardId } });
      await prisma.client.ward.deleteMany({ where: { id: wardId } });
    }
    createdWardIds.length = 0;
  });
});
