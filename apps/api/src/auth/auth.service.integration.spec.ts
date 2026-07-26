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
import { UserRepository } from './repositories/user.repository.js';
import { SessionRepository } from './repositories/session.repository.js';
import { WardCodeRepository } from './repositories/ward-code.repository.js';

function fakeConfig(): AppConfig {
  return {
    nodeEnv: 'test',
    appName: 'Ward Communications Hub',
    wardTimeZone: 'America/Denver',
    api: { host: '0.0.0.0', port: 3001, url: 'http://localhost:3001' },
    web: { port: 3000, url: 'http://localhost:3000' },
    worker: { healthPort: 3002 },
    databaseUrl: process.env.DATABASE_URL ?? '',
    redisUrl: 'redis://localhost:6379',
    session: { secret: 'a'.repeat(32), refreshTokenSecret: 'b'.repeat(32) },
    wardCodePepper: 'fictional-pepper-value',
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
  const authService = new AuthService(users, sessions, wardCodes, passwordHasher, wardCodeHasher, audit, config);

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

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    const ward = await prisma.client.ward.create({ data: { name: `Fictional Test Ward ${randomUUID()}` } });
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

  it('completes login end to end: password -> ward code required -> ward code verified -> session issued', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;

    const loginOutcome = await authService.login(user.username, password, context(deviceId));
    expect(loginOutcome.status).toBe('ward_code_required');
    if (loginOutcome.status !== 'ward_code_required') throw new Error('unreachable');

    const verifyOutcome = await authService.verifyWardCode(loginOutcome.loginTicket, wardCode, context(deviceId));
    expect(verifyOutcome.status).toBe('ok');
    if (verifyOutcome.status !== 'ok') throw new Error('unreachable');

    expect(verifyOutcome.user.username).toBe(user.username);
    // Never expose password/ward code hashes on the returned user object.
    expect(verifyOutcome.user).not.toHaveProperty('passwordHash');
    expect(verifyOutcome.user).not.toHaveProperty('codeHash');
    expect(verifyOutcome.sessionToken).toBeTruthy();
  });

  it('does not require ward code again on the same device once already verified for the active version', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;

    const first = await authService.login(user.username, password, context(deviceId));
    if (first.status !== 'ward_code_required') throw new Error('expected ward_code_required');
    await authService.verifyWardCode(first.loginTicket, wardCode, context(deviceId));

    const second = await authService.login(user.username, password, context(deviceId));
    expect(second.status).toBe('ok');
  });

  it('requires ward code again after the ward code is rotated', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;

    const first = await authService.login(user.username, password, context(deviceId));
    if (first.status !== 'ward_code_required') throw new Error('expected ward_code_required');
    await authService.verifyWardCode(first.loginTicket, wardCode, context(deviceId));

    const newCodeHash = await wardCodeHasher.hash('rotated-ward-code-9');
    await wardCodes.rotate(wardId, newCodeHash);

    const afterRotation = await authService.login(user.username, password, context(deviceId));
    expect(afterRotation.status).toBe('ward_code_required');
  });

  it('rejects invalid credentials without revealing whether the username exists', async () => {
    await expect(authService.login('no-such-user', 'whatever-12345', context('device-x'))).rejects.toThrow(
      InvalidCredentialsError,
    );

    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    await expect(authService.login(user.username, 'wrong-password-12345', context('device-x'))).rejects.toThrow(
      InvalidCredentialsError,
    );
  });

  it('locks the account after repeated failed attempts and blocks further attempts even with the correct password', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });

    for (let i = 0; i < LOCKOUT_THRESHOLD; i += 1) {
      await expect(
        authService.login(user.username, 'wrong-password-12345', context('device-lockout')),
      ).rejects.toThrow(InvalidCredentialsError);
    }

    await expect(authService.login(user.username, password, context('device-lockout'))).rejects.toThrow(
      AccountLockedError,
    );
  });

  it('rejects login for a disabled account', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    await authService.disableAccount(user.id, user.id, context('device-admin'));

    await expect(authService.login(user.username, password, context('device-y'))).rejects.toThrow(
      AccountDisabledError,
    );
  });

  it('disabling an account revokes all of its active sessions', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;
    const first = await authService.login(user.username, password, context(deviceId));
    if (first.status !== 'ward_code_required') throw new Error('expected ward_code_required');
    const verified = await authService.verifyWardCode(first.loginTicket, wardCode, context(deviceId));
    if (verified.status !== 'ok' || !verified.sessionToken) throw new Error('expected session token');

    await authService.disableAccount(user.id, user.id, context('device-admin'));

    await expect(authService.validateSessionToken(verified.sessionToken)).rejects.toThrow();
  });

  it('rotates the mobile refresh token on each refresh and invalidates the previous one', async () => {
    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    const deviceId = `device-${randomUUID()}`;

    const first = await authService.login(user.username, password, context(deviceId, 'mobile'));
    if (first.status !== 'ward_code_required') throw new Error('expected ward_code_required');
    const verified = await authService.verifyWardCode(first.loginTicket, wardCode, context(deviceId, 'mobile'));
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

    const first = await authService.login(user.username, password, context(deviceId));
    if (first.status !== 'ward_code_required') throw new Error('expected ward_code_required');
    const verified = await authService.verifyWardCode(first.loginTicket, wardCode, context(deviceId));
    if (verified.status !== 'ok' || !verified.sessionToken) throw new Error('expected session token');

    const { session } = await authService.validateSessionToken(verified.sessionToken);
    await authService.logout(session.id, user.id, context(deviceId));

    await expect(authService.validateSessionToken(verified.sessionToken)).rejects.toThrow();
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
