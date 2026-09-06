import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS,
  canIssueAccountToken,
  computeAccountTokenExpiry,
  computeOutboundIdempotencyKey,
  isAccountTokenUsable,
  normalizeEmail,
  validatePasswordStrength,
  type AccountTokenPurpose,
  type OutboundMessageKind,
} from '@ward-comms/domain';
import type { AppConfig } from '@ward-comms/config';
import { AuditService } from '../audit/audit.service.js';
import { APP_CONFIG } from '../config/app-config.module.js';
import { generateOpaqueToken, hashOpaqueToken } from '../common/session-token.util.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { UserRepository } from '../auth/repositories/user.repository.js';
import { SessionRepository } from '../auth/repositories/session.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { composePasswordResetEmail, composeVerificationEmail } from './account-email-copy.js';
import { OutboundQueueService } from './outbound-queue.service.js';
import { TRANSACTIONAL_EMAIL_ADAPTER } from './transactional-email.tokens.js';
import type { TransactionalEmailAdapter } from '@ward-comms/domain';
import { processOutboundMessage } from '@ward-comms/worker/outbound';

export interface AccountEmailContext {
  actorUserId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
}

const INVALID_LINK_MESSAGE = 'This link is invalid or has expired.';

@Injectable()
export class AccountEmailService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(OutboundQueueService) private readonly outboundQueue: OutboundQueueService,
    @Inject(TRANSACTIONAL_EMAIL_ADAPTER) private readonly email: TransactionalEmailAdapter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Reassigns an application-user email: normalize, enforce unique-per-ward
   * (excluding self), clear confirmation, and queue a new verification.
   * Audit metadata records that the address changed without storing it.
   */
  async changeEmailForUser(
    userId: string,
    email: string,
    context: AccountEmailContext,
  ): Promise<{ email: string; emailVerifiedAt: null }> {
    const user = await this.users.findById(userId);
    if (!user || user.archivedAt) {
      throw new NotFoundException('User not found.');
    }

    const normalized = normalizeEmail(email);
    if (!normalized) {
      throw new BadRequestException('Enter a valid email address.');
    }

    if (user.email === normalized) {
      throw new BadRequestException('This is already the email on this account.');
    }

    if (await this.users.isEmailTaken(user.wardId, normalized, userId)) {
      throw new ConflictException('A user with that email already exists in this ward.');
    }

    await this.users.updateEmail(userId, normalized);

    await this.audit.record({
      wardId: user.wardId,
      actorUserId: context.actorUserId,
      action: 'account.email_changed',
      entityType: 'ApplicationUser',
      entityId: userId,
      metadata: { verificationReset: true },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    try {
      await this.queueVerificationForUser(userId, context);
    } catch {
      // Address is persisted; the user or an admin can resend confirmation.
    }

    return { email: normalized, emailVerifiedAt: null };
  }

  async queueVerificationForUser(userId: string, context: AccountEmailContext): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.archivedAt) {
      throw new NotFoundException('User not found.');
    }
    if (!user.email) {
      throw new BadRequestException('This account does not have an email address.');
    }
    if (user.emailVerifiedAt) {
      throw new BadRequestException('This email address is already confirmed.');
    }

    await this.issueTokenAndEnqueue({
      user: { id: user.id, wardId: user.wardId, email: user.email, displayName: user.displayName },
      purpose: 'EmailVerification',
      context,
      silentRateLimit: false,
    });
  }

  async queuePasswordResetForUser(userId: string, context: AccountEmailContext): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user || user.archivedAt || user.disabledAt) {
      throw new NotFoundException('User not found.');
    }
    if (!user.email) {
      throw new BadRequestException('This account does not have an email address.');
    }

    await this.issueTokenAndEnqueue({
      user: { id: user.id, wardId: user.wardId, email: user.email, displayName: user.displayName },
      purpose: 'PasswordReset',
      context,
      silentRateLimit: false,
    });
  }

  /**
   * Public forgot-password. Always succeeds to the caller so usernames/emails
   * cannot be enumerated. Issues a reset for every active user with that email.
   */
  async requestPasswordResetByEmail(email: string, context: AccountEmailContext): Promise<void> {
    const normalized = normalizeEmail(email);
    if (!normalized) {
      return;
    }
    const matches = await this.users.findActiveByNormalizedEmail(normalized);
    for (const user of matches) {
      if (!user.email) continue;
      try {
        await this.issueTokenAndEnqueue({
          user: { id: user.id, wardId: user.wardId, email: user.email, displayName: user.displayName },
          purpose: 'PasswordReset',
          context,
          silentRateLimit: true,
        });
      } catch {
        // Best-effort per match; the public response stays generic.
      }
    }
  }

  async verifyEmail(rawToken: string, context: AccountEmailContext): Promise<void> {
    const token = await this.requireUsableToken(rawToken, 'EmailVerification');
    const now = new Date();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.userAccountToken.update({
        where: { id: token.id },
        data: { consumedAt: now },
      });
      await tx.applicationUser.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: now },
      });
    });

    await this.audit.record({
      wardId: token.user.wardId,
      actorUserId: context.actorUserId,
      action: 'account.email_verified',
      entityType: 'ApplicationUser',
      entityId: token.userId,
      metadata: { purpose: 'EmailVerification' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async completePasswordReset(
    rawToken: string,
    password: string,
    context: AccountEmailContext,
  ): Promise<void> {
    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      throw new BadRequestException(passwordCheck.errors.join(' '));
    }

    const token = await this.requireUsableToken(rawToken, 'PasswordReset');
    const passwordHash = await this.passwordHasher.hash(password);
    const now = new Date();

    await this.prisma.client.$transaction(async (tx) => {
      await tx.userAccountToken.update({
        where: { id: token.id },
        data: { consumedAt: now },
      });
      await tx.applicationUser.update({
        where: { id: token.userId },
        data: {
          passwordHash,
          passwordUpdatedAt: now,
          failedLoginAttempts: 0,
          lockedUntil: null,
          emailVerifiedAt: token.user.emailVerifiedAt ?? now,
        },
      });
    });

    await this.sessions.revokeAllForUser(token.userId);

    await this.audit.record({
      wardId: token.user.wardId,
      actorUserId: context.actorUserId,
      action: 'account.password_reset_completed',
      entityType: 'ApplicationUser',
      entityId: token.userId,
      metadata: { purpose: 'PasswordReset' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private async requireUsableToken(
    rawToken: string,
    purpose: AccountTokenPurpose,
  ): Promise<{
    id: string;
    userId: string;
    user: { wardId: string; emailVerifiedAt: Date | null };
  }> {
    const tokenHash = hashOpaqueToken(rawToken);
    const token = await this.prisma.client.userAccountToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { wardId: true, emailVerifiedAt: true, archivedAt: true, disabledAt: true } } },
    });

    if (
      !token ||
      token.purpose !== purpose ||
      token.user.archivedAt ||
      (purpose === 'PasswordReset' && token.user.disabledAt) ||
      !isAccountTokenUsable(token)
    ) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    return { id: token.id, userId: token.userId, user: token.user };
  }

  private async issueTokenAndEnqueue(input: {
    user: { id: string; wardId: string; email: string; displayName: string };
    purpose: AccountTokenPurpose;
    context: AccountEmailContext;
    silentRateLimit: boolean;
  }): Promise<void> {
    const now = new Date();
    const windowStart = new Date(now.getTime() - ACCOUNT_TOKEN_RATE_LIMIT_WINDOW_MS);
    const recent = await this.prisma.client.userAccountToken.findMany({
      where: { userId: input.user.id, purpose: input.purpose, createdAt: { gt: windowStart } },
      select: { createdAt: true },
    });
    const decision = canIssueAccountToken(
      recent.map((row) => row.createdAt),
      now,
    );
    if (!decision.allowed) {
      if (input.silentRateLimit) {
        return;
      }
      throw new ForbiddenException('Too many email requests. Please wait and try again.');
    }

    const rawToken = generateOpaqueToken();
    const tokenHash = hashOpaqueToken(rawToken);
    const tokenId = randomUUID();
    const messageId = randomUUID();
    const kind: OutboundMessageKind = input.purpose;
    const copy =
      input.purpose === 'EmailVerification'
        ? composeVerificationEmail({
            appName: this.config.appName,
            displayName: input.user.displayName,
            webUrl: this.config.web.url,
            token: rawToken,
          })
        : composePasswordResetEmail({
            appName: this.config.appName,
            displayName: input.user.displayName,
            webUrl: this.config.web.url,
            token: rawToken,
          });

    await this.prisma.client.$transaction(async (tx) => {
      await tx.userAccountToken.updateMany({
        where: { userId: input.user.id, purpose: input.purpose, consumedAt: null },
        data: { consumedAt: now },
      });
      await tx.outboundMessage.updateMany({
        where: { userId: input.user.id, kind, status: 'Pending' },
        data: { status: 'Failed', lastError: 'superseded' },
      });
      await tx.userAccountToken.create({
        data: {
          id: tokenId,
          userId: input.user.id,
          purpose: input.purpose,
          tokenHash,
          expiresAt: computeAccountTokenExpiry(input.purpose, now),
        },
      });
      await tx.outboundMessage.create({
        data: {
          id: messageId,
          wardId: input.user.wardId,
          userId: input.user.id,
          kind,
          channel: 'Email',
          toAddress: input.user.email,
          subject: copy.subject,
          body: copy.body,
          idempotencyKey: computeOutboundIdempotencyKey({
            kind,
            userId: input.user.id,
            tokenId,
          }),
          status: 'Pending',
        },
      });
    });

    await this.audit.record({
      wardId: input.user.wardId,
      actorUserId: input.context.actorUserId,
      action:
        input.purpose === 'EmailVerification'
          ? 'account.verification_email_queued'
          : 'account.password_reset_email_queued',
      entityType: 'ApplicationUser',
      entityId: input.user.id,
      metadata: { outboundMessageId: messageId, kind },
      ipAddress: input.context.ipAddress,
      userAgent: input.context.userAgent,
    });

    try {
      await this.outboundQueue.enqueue(messageId);
    } catch {
      // Outbox row remains Pending; worker/cron poller will send.
    }
    await processOutboundMessage(
      {
        prisma: this.prisma.client,
        email: this.email,
        enqueueRetry: async (outboundMessageId, delayMs) => {
          await this.outboundQueue.enqueueRetry(outboundMessageId, delayMs);
        },
      },
      messageId,
    ).catch(() => {
      // Worker / cron retries from the outbox if immediate send fails.
    });
  }
}
