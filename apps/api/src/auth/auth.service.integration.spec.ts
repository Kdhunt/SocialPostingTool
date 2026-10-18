// Live-database integration tests for the Phase 4 authentication flows.
//
// Skips automatically (rather than failing) when no migrated PostgreSQL
// instance is reachable (see docs/domain-model.md for the same pattern in
// packages/database), so `pnpm test` stays green in sandboxed
// environments without Docker while still providing real, end-to-end
// coverage of the login / ward-code / lockout / refresh / logout flows
// wherever a database is available:
//
//   docker compose up -d postgres
//   pnpm --filter @ward-comms/database db:migrate
//   pnpm --filter @ward-comms/api test
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '@ward-comms/config';
import { LOCKOUT_THRESHOLD } from '@ward-comms/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService, AccountDisabledError, AccountLockedError, InvalidCredentialsError } from './auth.service.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { WardCodeHasherService } from './ward-code-hasher.service.js';
import { UnitCodeLookupService } from './unit-code-lookup.service.js';
import { UserRepository } from './repositories/user.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { WardCodeRepository } from './repositories/ward-code.repository.js';
import { computeTotpCode } from './totp-verifier.service.js';

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

describe.skipIf(!databaseAvailable)('AuthService — live PostgreSQL integration', () => {
  const config = fakeConfig();
  const audit = new AuditService(prisma);
  const users = new UserRepository(prisma);
  const sessions = new SessionRepository(prisma);
  const wardCodes = new WardCodeRepository(prisma);
  const passwordHasher = new PasswordHasherService();
  const wardCodeHasher = new WardCodeHasherService(config);
  const unitCodes = new UnitCodeLookupService(wardCodes, wardCodeHasher);
  const authService = new AuthService(users, sessions, wardCodes, passwordHasher, wardCodeHasher, unitCodes, audit, config);

  let wardId: string;
  const password = 'Fictional-Password-42';
  const wardCode = 'fictional-ward-code-7';
  let userId: string;

  function context(
    deviceId: string,
    clientType: 'web' | 'mobile' = 'web',
  ): { ipAddress: string; userAgent: string; deviceId: string; clientType: 'web' | 'mobile' } {
    return { ipAddress: '203.0.113.10', userAgent: 'vitest', deviceId, clientType };
  }

  function wardLogin(
    username: string,
    pwd: string,
    ctx: { ipAddress: string; userAgent: string; deviceId: string; clientType: 'web' | 'mobile' },
  ): ReturnType<AuthService['login']> {
    return authService.login(username, pwd, ctx, wardCode);
  }

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    const ward = await prisma.client.ward.create({
      data: { name: `Fictional Test Ward ${randomUUID()}`, publicSlug: `w${randomUUID().replace(/-/g, '')}` },
    });
    wardId = ward.id;

    const passwordHash = await passwordHasher.hash(password);
    const user = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: `fictional.user.${randomUUID()}`,
        displayName: 'Fictional Test User',
        passwordHash,
      },
    });
    userId = user.id;

    const codeHash = await wardCodeHasher.hash(wardCode);
    await prisma.client.wardCodeVersion.create({
      data: { wardId, version: 1, codeHash, activatedAt: new Date() },
    });
  });

  it('signs in with username, password and unit code in one step and issues a session', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;

    const verifyOutcome = await wardLogin(user.username, password, context(deviceId));
    expect(verifyOutcome.status).toBe('ok');
    if (verifyOutcome.status !== 'ok') throw new Error('unreachable');

    expect(verifyOutcome.user.username).toBe(user.username);
    expect(verifyOutcome.user).not.toHaveProperty('passwordHash');
    expect(verifyOutcome.user).not.toHaveProperty('codeHash');
    expect(verifyOutcome.sessionToken).toBeTruthy();
  });

  it('requires TOTP after the password when two-factor authentication is enabled', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;

    const { secret } = await authService.beginTotpEnrollment(user.id);
    await authService.confirmTotpEnrollment(user.id, computeTotpCode(secret), context(deviceId));

    const loginOutcome = await wardLogin(user.username, password, context(deviceId));
    expect(loginOutcome.status).toBe('totp_required');
    if (loginOutcome.status !== 'totp_required') throw new Error('unreachable');

    const verifyOutcome = await authService.verifyTotp(
      loginOutcome.loginTicket,
      computeTotpCode(secret),
      context(deviceId),
    );
    expect(verifyOutcome.status).toBe('ok');
    if (verifyOutcome.status !== 'ok') throw new Error('unreachable');
    expect(verifyOutcome.user.totpEnabled).toBe(true);
  });

  it('tells the user to sign in again when the unit code is rotated during the TOTP step', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;
    const { secret } = await authService.beginTotpEnrollment(user.id);
    await authService.confirmTotpEnrollment(user.id, computeTotpCode(secret), context(deviceId));

    const loginOutcome = await wardLogin(user.username, password, context(deviceId));
    if (loginOutcome.status !== 'totp_required') throw new Error('expected totp_required');

    const rotated = 'rotated-mid-login-9';
    await wardCodes.rotate(wardId, await wardCodeHasher.hash(rotated), wardCodeHasher.lookupKey(rotated));

    await expect(
      authService.verifyTotp(loginOutcome.loginTicket, computeTotpCode(secret), context(deviceId)),
    ).rejects.toThrow(/sign-in code changed/i);
    const event = await prisma.client.auditEvent.findFirst({
      where: { action: 'auth.login.unit_code_rotated_mid_login', entityId: user.id },
    });
    expect(event).toBeTruthy();
  });

  it('rejects a wrong or missing-unit code with the same generic error', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    await expect(
      authService.login(user.username, password, context(`device-${randomUUID()}`), 'not-a-real-code'),
    ).rejects.toThrow(InvalidCredentialsError);
  });

  it('accepts only the new code after the unit code is rotated', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const rotated = 'rotated-ward-code-9';
    await wardCodes.rotate(wardId, await wardCodeHasher.hash(rotated), wardCodeHasher.lookupKey(rotated));

    await expect(wardLogin(user.username, password, context(`device-${randomUUID()}`))).rejects.toThrow(
      InvalidCredentialsError,
    );
    const afterRotation = await authService.login(user.username, password, context(`device-${randomUUID()}`), rotated);
    expect(afterRotation.status).toBe('ok');
  });

  it('backfills the lookup key on older code rows and still signs in', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const before = await prisma.client.wardCodeVersion.findFirstOrThrow({ where: { wardId, retiredAt: null } });
    expect(before.lookupKey).toBeNull();

    expect((await wardLogin(user.username, password, context(`device-${randomUUID()}`))).status).toBe('ok');
    const after = await prisma.client.wardCodeVersion.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.lookupKey).toBe(wardCodeHasher.lookupKey(wardCode));
    expect((await wardLogin(user.username, password, context(`device-${randomUUID()}`))).status).toBe('ok');
  });

  it('refuses to guess when the same code is active in two units', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const otherWard = await prisma.client.ward.create({
      data: { name: `Fictional Same Code Ward ${randomUUID()}`, publicSlug: `s${randomUUID().replace(/-/g, '')}` },
    });
    // Both rows predate lookup keys, as a duplicate from before uniqueness was enforced would.
    await prisma.client.wardCodeVersion.create({
      data: { wardId: otherWard.id, version: 1, codeHash: await wardCodeHasher.hash(wardCode), activatedAt: new Date() },
    });
    try {
      await expect(wardLogin(user.username, password, context('device-dup'))).rejects.toThrow(InvalidCredentialsError);
      // Still ambiguous once both rows have been keyed by that first attempt.
      await expect(wardLogin(user.username, password, context('device-dup'))).rejects.toThrow(InvalidCredentialsError);
      const signal = await prisma.client.auditEvent.findFirst({
        where: { action: 'auth.login.ambiguous_unit_code' },
        orderBy: { createdAt: 'desc' },
      });
      expect(signal).toBeTruthy();
      expect(JSON.stringify(signal?.metadata ?? {})).toContain(otherWard.id);
      expect(JSON.stringify(signal ?? {})).not.toContain(wardCode);
    } finally {
      await prisma.client.wardCodeVersion.deleteMany({ where: { wardId: otherWard.id } });
      await prisma.client.ward.delete({ where: { id: otherWard.id } });
    }
  });

  it('signs a stake user in with the stake code, scoped to the stake', async () => {
    const stake = await prisma.client.ward.create({
      data: {
        name: `Fictional Stake ${randomUUID()}`,
        publicSlug: `k${randomUUID().replace(/-/g, '')}`,
        level: 'Stake',
      },
    });
    await prisma.client.ward.update({ where: { id: wardId }, data: { parentId: stake.id } });
    const stakeCode = `fictional-stake-code-${randomUUID()}`;
    await prisma.client.wardCodeVersion.create({
      data: {
        wardId: stake.id,
        version: 1,
        codeHash: await wardCodeHasher.hash(stakeCode),
        lookupKey: wardCodeHasher.lookupKey(stakeCode),
        activatedAt: new Date(),
      },
    });
    const stakeUser = await prisma.client.applicationUser.create({
      data: {
        wardId: stake.id,
        username: `fictional.stake.${randomUUID()}`,
        displayName: 'Fictional Stake Clerk',
        passwordHash: await passwordHasher.hash(password),
      },
    });
    const ward = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    try {
      const outcome = await authService.login(stakeUser.username, password, context(`device-${randomUUID()}`), stakeCode);
      expect(outcome.status).toBe('ok');
      if (outcome.status !== 'ok') throw new Error('unreachable');
      expect(outcome.user.wardId).toBe(stake.id);

      // A ward user cannot sign in with the stake's code, and vice versa.
      await expect(
        authService.login(ward.username, password, context(`device-${randomUUID()}`), stakeCode),
      ).rejects.toThrow(InvalidCredentialsError);
      await expect(
        authService.login(stakeUser.username, password, context(`device-${randomUUID()}`), wardCode),
      ).rejects.toThrow(InvalidCredentialsError);
    } finally {
      await prisma.client.ward.update({ where: { id: wardId }, data: { parentId: null } });
      await prisma.client.userSession.deleteMany({ where: { userId: stakeUser.id } });
      await prisma.client.applicationUser.delete({ where: { id: stakeUser.id } });
      await prisma.client.wardCodeVersion.deleteMany({ where: { wardId: stake.id } });
      await prisma.client.ward.delete({ where: { id: stake.id } });
    }
  });

  it('rejects invalid credentials without revealing whether the username exists', async () => {
    await expect(authService.login('no-such-user', 'whatever-12345', context('device-x'))).rejects.toThrow(
      InvalidCredentialsError,
    );

    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    await expect(wardLogin(user.username, 'wrong-password-12345', context('device-x'))).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('locks the account after repeated failed attempts and blocks further attempts even with the correct password', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });

    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
      await expect(
        wardLogin(user.username, 'wrong-password-12345', context('device-lockout')),
      ).rejects.toThrow(InvalidCredentialsError);
    }

    await expect(wardLogin(user.username, password, context('device-lockout'))).rejects.toThrow(
      AccountLockedError,
    );
  });

  it('rejects login for a disabled account', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    await authService.disableAccount(user.id, user.id, context('device-admin'));

    await expect(wardLogin(user.username, password, context('device-y'))).rejects.toThrow(
      AccountDisabledError,
    );
  });

  it('disabling an account revokes all of its active sessions', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;
    const verified = await wardLogin(user.username, password, context(deviceId));
    if (verified.status !== 'ok' || !verified.sessionToken) throw new Error('expected session token');

    await authService.disableAccount(user.id, user.id, context('device-admin'));

    await expect(authService.validateSessionToken(verified.sessionToken)).rejects.toThrow();
  });

  it('rotates the mobile refresh token on each refresh and invalidates the previous one', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;

    const verified = await wardLogin(user.username, password, context(deviceId, 'mobile'));
    if (verified.status !== 'ok' || !verified.tokens) throw new Error('expected mobile tokens');

    const originalRefreshToken = verified.tokens.refreshToken;
    const { tokens: rotated } = await authService.refresh(originalRefreshToken, context(deviceId, 'mobile'));

    expect(rotated.refreshToken).not.toBe(originalRefreshToken);
    await expect(authService.refresh(originalRefreshToken, context(deviceId, 'mobile'))).rejects.toThrow();

    const { user: refreshedUser } = await authService.validateAccessToken(rotated.accessToken);
    expect(refreshedUser.id).toBe(user.id);
  });

  it('logging out revokes the session so it can no longer authenticate requests', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;

    const verified = await wardLogin(user.username, password, context(deviceId));
    if (verified.status !== 'ok' || !verified.sessionToken) throw new Error('expected session token');

    const { session } = await authService.validateSessionToken(verified.sessionToken);
    await authService.logout(session.id, user.id, context(deviceId));

    await expect(authService.validateSessionToken(verified.sessionToken)).rejects.toThrow();
  });

  it('changes the signed-in password, revokes sessions, and rejects the previous password', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;
    const verified = await wardLogin(user.username, password, context(deviceId));
    if (verified.status !== 'ok' || !verified.sessionToken) throw new Error('expected session token');

    await authService.changeOwnPassword(user.id, password, 'Fictional-Reset-99x', context(deviceId));

    await expect(authService.validateSessionToken(verified.sessionToken)).rejects.toThrow();
    await expect(wardLogin(user.username, password, context(`device-${randomUUID()}`))).rejects.toThrow(
      InvalidCredentialsError,
    );

    const afterChange = await wardLogin(user.username, 'Fictional-Reset-99x', context(`device-${randomUUID()}`));
    expect(afterChange.status).toBe('ok');

    await expect(
      authService.changeOwnPassword(user.id, 'wrong-current-99x', 'Fictional-Another-99x', context(deviceId)),
    ).rejects.toThrow(/Incorrect current password/i);

    const auditEvent = await prisma.client.auditEvent.findFirst({
      where: { action: 'account.password_changed', entityId: user.id },
    });
    expect(auditEvent).toBeTruthy();
    expect(JSON.stringify(auditEvent ?? {})).not.toMatch(/Fictional-Reset-99x/);
  });

  it('lets two wards share a username and keeps platform login ward-agnostic', async () => {
    const platformRole =
      (await prisma.client.role.findUnique({ where: { name: 'PlatformAdmin' } })) ??
      (await prisma.client.role.create({ data: { name: 'PlatformAdmin', description: 'Platform operator' } }));

    const previousOperatorRoles = await prisma.client.userRole.findMany({
      where: { roleId: platformRole.id },
      select: { userId: true, roleId: true },
    });
    await prisma.client.userRole.deleteMany({ where: { roleId: platformRole.id } });

    const sharedUsername = `admin.${randomUUID().slice(0, 8)}`;
    const operatorHash = await passwordHasher.hash(password);
    const operator = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: sharedUsername,
        displayName: 'Fictional Platform Operator',
        passwordHash: operatorHash,
      },
    });
    await prisma.client.userRole.create({ data: { userId: operator.id, roleId: platformRole.id } });

    const otherWard = await prisma.client.ward.create({
      data: { name: `Fictional Other Ward ${randomUUID()}`, publicSlug: `o${randomUUID().replace(/-/g, '')}` },
    });
    const clerk = await prisma.client.applicationUser.create({
      data: {
        wardId: otherWard.id,
        username: sharedUsername,
        displayName: 'Fictional Ward Clerk',
        passwordHash: operatorHash,
      },
    });
    const otherWardCode = `fictional-other-code-${randomUUID()}`;
    await prisma.client.wardCodeVersion.create({
      data: {
        wardId: otherWard.id,
        version: 1,
        codeHash: await wardCodeHasher.hash(otherWardCode),
        lookupKey: wardCodeHasher.lookupKey(otherWardCode),
        activatedAt: new Date(),
      },
    });

    const extraUserIds: string[] = [operator.id, clerk.id];

    try {
      const platformLogin = await authService.login(sharedUsername, password, context(`device-${randomUUID()}`));
      expect(platformLogin.status).toBe('ok');
      if (platformLogin.status !== 'ok') throw new Error('expected platform session');
      expect(platformLogin.user.id).toBe(operator.id);

      const clerkVerified = await authService.login(
        sharedUsername,
        password,
        context(`device-${randomUUID()}`),
        otherWardCode,
      );
      expect(clerkVerified.status).toBe('ok');
      if (clerkVerified.status !== 'ok') throw new Error('expected clerk session');
      expect(clerkVerified.user.id).toBe(clerk.id);
      expect(clerkVerified.user.id).not.toBe(operator.id);

      await expect(
        authService.login(sharedUsername, password, context(`device-${randomUUID()}`), wardCode),
      ).rejects.toThrow(InvalidCredentialsError);

      const clerkOnlyUsername = `clerk.${randomUUID().slice(0, 8)}`;
      const clerkOnly = await prisma.client.applicationUser.create({
        data: {
          wardId: otherWard.id,
          username: clerkOnlyUsername,
          displayName: 'Fictional Clerk Only',
          passwordHash: operatorHash,
        },
      });
      extraUserIds.push(clerkOnly.id);
      await expect(
        authService.login(clerkOnlyUsername, password, context(`device-${randomUUID()}`)),
      ).rejects.toThrow(InvalidCredentialsError);
    } finally {
      await prisma.client.userSession.deleteMany({ where: { userId: { in: extraUserIds } } });
      await prisma.client.userRole.deleteMany({ where: { roleId: platformRole.id } });
      if (previousOperatorRoles.length > 0) {
        await prisma.client.userRole.createMany({ data: previousOperatorRoles, skipDuplicates: true });
      }
      await prisma.client.wardCodeVersion.deleteMany({ where: { wardId: otherWard.id } });
      await prisma.client.applicationUser.deleteMany({ where: { id: { in: extraUserIds } } });
      await prisma.client.ward.deleteMany({ where: { id: otherWard.id } });
    }
  });

  it('surfaces a user permission set derived from assigned roles, never a raw hash', async () => {
    const permissionKey = `fictional.permission.${randomUUID()}`;
    const permission = await prisma.client.permission.create({ data: { key: permissionKey } });
    const role = await prisma.client.role.create({ data: { name: `Fictional Role ${randomUUID()}` } });
    await prisma.client.rolePermission.create({ data: { roleId: role.id, permissionId: permission.id } });
    await prisma.client.userRole.create({ data: { userId, roleId: role.id } });

    const permissionKeys = await users.getPermissionKeys(userId);
    expect(permissionKeys).toContain(permissionKey);

    await prisma.client.userRole.deleteMany({ where: { roleId: role.id } });
    await prisma.client.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.client.role.delete({ where: { id: role.id } });
    await prisma.client.permission.delete({ where: { id: permission.id } });
  });

  afterEach(async () => {
    await prisma.client.userSession.deleteMany({ where: { userId } });
    await prisma.client.wardCodeVersion.deleteMany({ where: { wardId } });
    await prisma.client.userRole.deleteMany({ where: { userId } });
    await prisma.client.applicationUser.deleteMany({ where: { id: userId } });
    await prisma.client.ward.deleteMany({ where: { id: wardId } });
  });
});
