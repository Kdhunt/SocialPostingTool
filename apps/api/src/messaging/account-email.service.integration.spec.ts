import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '@ward-comms/config';
import type { TransactionalEmailAdapter, TransactionalEmailRequest } from '@ward-comms/domain';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { UserRepository } from '../auth/repositories/user.repository.js';
import { SessionRepository } from '../auth/repositories/session.repository.js';
import { AccountEmailService } from './account-email.service.js';
import type { OutboundQueueService } from './outbound-queue.service.js';

class CapturingEmailAdapter implements TransactionalEmailAdapter {
  readonly sent: TransactionalEmailRequest[] = [];

  async send(request: TransactionalEmailRequest): Promise<{ success: true; providerMessageId: string }> {
    this.sent.push(request);
    return { success: true, providerMessageId: `test-${this.sent.length}` };
  }
}

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

function tokenFromBody(body: string, path: 'verify-email' | 'reset-password'): string {
  const match = body.match(new RegExp(`${path}\\?token=([^\\s]+)`));
  if (!match?.[1]) {
    throw new Error(`Token not found in ${path} email body`);
  }
  return decodeURIComponent(match[1]);
}

async function isMigratedDatabaseAvailable(prisma: PrismaService): Promise<boolean> {
  try {
    await prisma.client.outboundMessage.findFirst();
    return true;
  } catch {
    return false;
  }
}

const prisma = new PrismaService();
const databaseAvailable = await isMigratedDatabaseAvailable(prisma);

describe.skipIf(!databaseAvailable)('AccountEmailService — live PostgreSQL integration', () => {
  const audit = new AuditService(prisma);
  const users = new UserRepository(prisma);
  const sessions = new SessionRepository(prisma);
  const passwordHasher = new PasswordHasherService();
  const adapter = new CapturingEmailAdapter();
  const queue = {
    enqueue: async (): Promise<void> => undefined,
    enqueueRetry: async (): Promise<void> => undefined,
  } as unknown as OutboundQueueService;
  const service = new AccountEmailService(
    prisma,
    users,
    sessions,
    passwordHasher,
    audit,
    queue,
    adapter,
    fakeConfig(),
  );

  const createdWardIds: string[] = [];
  let wardId: string;
  let userId: string;

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    adapter.sent.length = 0;
    const ward = await prisma.client.ward.create({
      data: { name: `Fictional Mail Ward ${randomUUID()}` },
    });
    createdWardIds.push(ward.id);
    wardId = ward.id;
    const user = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: `mail.user.${randomUUID()}`,
        email: `mail.${randomUUID()}@example.com`,
        displayName: 'Fictional Mail User',
        passwordHash: await passwordHasher.hash('Fictional-Original-42'),
      },
    });
    userId = user.id;
  });

  afterEach(async () => {
    for (const id of createdWardIds) {
      await prisma.client.auditEvent.deleteMany({ where: { wardId: id } });
      await prisma.client.outboundMessage.deleteMany({ where: { wardId: id } });
      await prisma.client.userAccountToken.deleteMany({ where: { user: { wardId: id } } });
      await prisma.client.userSession.deleteMany({ where: { user: { wardId: id } } });
      await prisma.client.applicationUser.deleteMany({ where: { wardId: id } });
      await prisma.client.ward.deleteMany({ where: { id } });
    }
    createdWardIds.length = 0;
  });

  it('sends a verification email, hashes the token, and confirms the inbox', async () => {
    await service.queueVerificationForUser(userId, {
      actorUserId: userId,
      ipAddress: '203.0.113.10',
      userAgent: 'vitest',
    });

    expect(adapter.sent).toHaveLength(1);
    const rawToken = tokenFromBody(adapter.sent[0]?.body ?? '', 'verify-email');
    const stored = await prisma.client.userAccountToken.findFirst({
      where: { userId, purpose: 'EmailVerification' },
    });
    expect(stored).toBeTruthy();
    expect(stored?.tokenHash).not.toBe(rawToken);

    const sentRow = await prisma.client.outboundMessage.findFirst({
      where: { userId, kind: 'EmailVerification', status: 'Sent' },
    });
    expect(sentRow?.body).toBe('[redacted after send]');
    expect(JSON.stringify(sentRow)).not.toContain(rawToken);

    await service.verifyEmail(rawToken, { actorUserId: null, ipAddress: null, userAgent: null });
    const verified = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    expect(verified.emailVerifiedAt).toBeTruthy();

    await expect(
      service.verifyEmail(rawToken, { actorUserId: null, ipAddress: null, userAgent: null }),
    ).rejects.toThrow(/invalid or has expired/i);
  });

  it('resets a password from an emailed token and does not reveal missing accounts', async () => {
    await service.requestPasswordResetByEmail('nobody@example.com', {
      actorUserId: null,
      ipAddress: null,
      userAgent: null,
    });
    expect(adapter.sent).toHaveLength(0);

    const user = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    await service.requestPasswordResetByEmail(user.email ?? '', {
      actorUserId: null,
      ipAddress: '203.0.113.11',
      userAgent: 'vitest',
    });
    expect(adapter.sent).toHaveLength(1);
    const rawToken = tokenFromBody(adapter.sent[0]?.body ?? '', 'reset-password');

    await service.completePasswordReset(rawToken, 'Fictional-Reset-99x', {
      actorUserId: null,
      ipAddress: null,
      userAgent: null,
    });

    const updated = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    expect(await passwordHasher.verify(updated.passwordHash, 'Fictional-Reset-99x')).toBe(true);
    expect(updated.emailVerifiedAt).toBeTruthy();
    expect(await passwordHasher.verify(updated.passwordHash, 'Fictional-Original-42')).toBe(false);
  });

  it('changes email, clears confirmation, and rejects a duplicate in the same ward', async () => {
    await prisma.client.applicationUser.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });

    const neighbor = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: `mail.neighbor.${randomUUID()}`,
        email: `neighbor.${randomUUID()}@example.com`,
        displayName: 'Fictional Neighbor',
        passwordHash: await passwordHasher.hash('Fictional-Original-42'),
      },
    });

    const context = { actorUserId: userId, ipAddress: '203.0.113.10', userAgent: 'vitest' };
    const changed = await service.changeEmailForUser(userId, '  Next.Inbox@Example.COM  ', context);
    expect(changed.email).toBe('next.inbox@example.com');
    expect(changed.emailVerifiedAt).toBeNull();

    const persisted = await prisma.client.applicationUser.findUniqueOrThrow({ where: { id: userId } });
    expect(persisted.email).toBe('next.inbox@example.com');
    expect(persisted.emailVerifiedAt).toBeNull();
    expect(adapter.sent.some((item) => item.toAddress === 'next.inbox@example.com')).toBe(true);

    const auditEvent = await prisma.client.auditEvent.findFirst({
      where: { action: 'account.email_changed', entityId: userId },
    });
    expect(auditEvent).toBeTruthy();
    expect(JSON.stringify(auditEvent ?? {})).not.toMatch(/next\.inbox@example\.com/i);

    await expect(service.changeEmailForUser(userId, neighbor.email ?? '', context)).rejects.toThrow(
      /email already exists/i,
    );
  });

  it('rate-limits repeated verification emails for the same user', async () => {
    const context = { actorUserId: userId, ipAddress: null, userAgent: null };
    await service.queueVerificationForUser(userId, context);
    await service.queueVerificationForUser(userId, context);
    await service.queueVerificationForUser(userId, context);
    await expect(service.queueVerificationForUser(userId, context)).rejects.toThrow(/Too many email requests/i);
  });
});
