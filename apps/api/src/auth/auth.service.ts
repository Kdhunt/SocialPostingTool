import { ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ApplicationUser, UserSession } from '@prisma/client';
import type { AppConfig } from '@ward-comms/config';
import {
  computeLockedUntil,
  isAccountLocked,
  isSessionValid,
  LOGIN_TICKET_TTL_MS,
  MOBILE_ACCESS_TOKEN_TTL_MS,
  MOBILE_REFRESH_TOKEN_TTL_MS,
  requiresWardCodeVerification,
  WEB_SESSION_TTL_MS,
} from '@ward-comms/domain';
import type { AuthUser, ClientType, MobileTokenPair } from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import { APP_CONFIG } from '../config/app-config.module.js';
import { generateOpaqueToken, hashOpaqueToken } from '../common/session-token.util.js';
import { InvalidSignedTokenError, signToken, verifyToken } from '../common/signed-token.util.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { WardCodeHasherService } from './ward-code-hasher.service.js';
import { SessionRepository } from './repositories/session.repository.js';
import { UserRepository } from './repositories/user.repository.js';
import { WardCodeRepository } from './repositories/ward-code.repository.js';

export interface RequestContext {
  ipAddress: string | null;
  userAgent: string | null;
  /** Persistent per-device identifier (server-issued, non-secret cookie for web; app-generated for mobile). */
  deviceId: string;
  clientType: ClientType;
}

export type LoginOutcome =
  | { status: 'ward_code_required'; loginTicket: string }
  | { status: 'ok'; user: AuthUser; tokens?: MobileTokenPair; sessionToken?: string; sessionExpiresAt: Date };

interface LoginTicketPayload extends Record<string, unknown> {
  purpose: 'ward_code';
  userId: string;
  deviceId: string;
}

interface AccessTokenPayload extends Record<string, unknown> {
  purpose: 'access';
  sessionId: string;
  userId: string;
}

export class InvalidCredentialsError extends UnauthorizedException {
  constructor() {
    super('Invalid username or password.');
  }
}

export class AccountLockedError extends UnauthorizedException {
  constructor() {
    super('This account is temporarily locked due to repeated failed sign-in attempts.');
  }
}

export class AccountDisabledError extends ForbiddenException {
  constructor() {
    super('This account has been disabled.');
  }
}

/**
 * Orchestrates the Phase 4 authentication flows. Contains the
 * *application* logic (sequencing repositories, hashers, audit events);
 * the actual security rules it calls into (lockout thresholds, ward code
 * re-verification, session validity) are pure functions from
 * packages/domain.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(WardCodeRepository) private readonly wardCodes: WardCodeRepository,
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(WardCodeHasherService) private readonly wardCodeHasher: WardCodeHasherService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async login(username: string, password: string, context: RequestContext): Promise<LoginOutcome> {
    const user = await this.users.findActiveByUsername(username);

    if (!user) {
      // Generic failure — never reveal whether the username exists.
      await this.audit.record({
        action: 'auth.login.failure',
        entityType: 'ApplicationUser',
        metadata: { reason: 'unknown_username' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new InvalidCredentialsError();
    }

    if (user.disabledAt) {
      await this.audit.record({
        wardId: user.wardId,
        actorUserId: user.id,
        action: 'auth.login.blocked_disabled',
        entityType: 'ApplicationUser',
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new AccountDisabledError();
    }

    if (isAccountLocked(user.lockedUntil)) {
      await this.audit.record({
        wardId: user.wardId,
        actorUserId: user.id,
        action: 'auth.login.blocked_locked',
        entityType: 'ApplicationUser',
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new AccountLockedError();
    }

    const passwordValid = await this.passwordHasher.verify(user.passwordHash, password);
    if (!passwordValid) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const lockedUntil = computeLockedUntil(failedAttempts);
      await this.users.recordFailedLogin(user.id, failedAttempts, lockedUntil);
      await this.audit.record({
        wardId: user.wardId,
        actorUserId: user.id,
        action: 'auth.login.failure',
        entityType: 'ApplicationUser',
        entityId: user.id,
        metadata: { reason: 'invalid_password', failedAttempts, locked: lockedUntil !== null },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new InvalidCredentialsError();
    }

    await this.audit.record({
      wardId: user.wardId,
      actorUserId: user.id,
      action: 'auth.login.password_verified',
      entityType: 'ApplicationUser',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const activeWardCodeVersion = await this.wardCodes.findActiveVersion(user.wardId);
    if (activeWardCodeVersion) {
      const lastVerifiedSession = await this.sessions.findLatestVerifiedForDevice(user.id, context.deviceId);
      const wardCodeRequired = requiresWardCodeVerification({
        lastVerifiedWardCodeVersionId: lastVerifiedSession?.wardCodeVersionId ?? null,
        activeWardCodeVersionId: activeWardCodeVersion.id,
      });

      if (wardCodeRequired) {
        const loginTicket = signToken<LoginTicketPayload>(
          { purpose: 'ward_code', userId: user.id, deviceId: context.deviceId },
          this.config.session.secret,
          LOGIN_TICKET_TTL_MS,
        );
        await this.audit.record({
          wardId: user.wardId,
          actorUserId: user.id,
          action: 'auth.login.ward_code_required',
          entityType: 'ApplicationUser',
          entityId: user.id,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
        });
        return { status: 'ward_code_required', loginTicket };
      }

      return this.completeLogin(user, activeWardCodeVersion.id, context);
    }

    // No ward code has been configured for this ward yet — nothing to verify against.
    return this.completeLogin(user, null, context);
  }

  async verifyWardCode(loginTicket: string, wardCode: string, context: RequestContext): Promise<LoginOutcome> {
    let payload: LoginTicketPayload;
    try {
      payload = verifyToken<LoginTicketPayload>(loginTicket, this.config.session.secret);
    } catch (error) {
      if (error instanceof InvalidSignedTokenError) {
        throw new UnauthorizedException('This sign-in attempt has expired. Please sign in again.');
      }
      throw error;
    }

    if (payload.purpose !== 'ward_code' || payload.deviceId !== context.deviceId) {
      throw new UnauthorizedException('This sign-in attempt is no longer valid. Please sign in again.');
    }

    const user = await this.users.findById(payload.userId);
    if (!user || user.disabledAt) {
      throw new InvalidCredentialsError();
    }

    const activeWardCodeVersion = await this.wardCodes.findActiveVersion(user.wardId);
    if (!activeWardCodeVersion) {
      throw new UnauthorizedException('No ward code has been configured for this ward.');
    }

    const wardCodeValid = await this.wardCodeHasher.verify(activeWardCodeVersion.codeHash, wardCode);
    if (!wardCodeValid) {
      await this.audit.record({
        wardId: user.wardId,
        actorUserId: user.id,
        action: 'auth.ward_code.failure',
        entityType: 'ApplicationUser',
        entityId: user.id,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
      throw new UnauthorizedException('Incorrect ward code.');
    }

    await this.audit.record({
      wardId: user.wardId,
      actorUserId: user.id,
      action: 'auth.ward_code.verified',
      entityType: 'ApplicationUser',
      entityId: user.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.completeLogin(user, activeWardCodeVersion.id, context);
  }

  private async completeLogin(
    user: ApplicationUser,
    wardCodeVersionId: string | null,
    context: RequestContext,
  ): Promise<LoginOutcome> {
    await this.users.recordSuccessfulLogin(user.id);

    const permissionKeys = await this.users.getPermissionKeys(user.id);
    const authUser: AuthUser = {
      id: user.id,
      wardId: user.wardId,
      username: user.username,
      displayName: user.displayName,
      permissions: permissionKeys,
    };

    if (context.clientType === 'mobile') {
      const refreshToken = generateOpaqueToken();
      const refreshTokenHash = hashOpaqueToken(refreshToken);
      const session = await this.createSessionRow(user.id, refreshTokenHash, refreshTokenHash, wardCodeVersionId, context, MOBILE_REFRESH_TOKEN_TTL_MS);

      const accessToken = this.issueAccessToken(session, user.id);

      await this.audit.record({
        wardId: user.wardId,
        actorUserId: user.id,
        action: 'auth.login.success',
        entityType: 'UserSession',
        entityId: session.id,
        metadata: { clientType: 'mobile' },
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });

      return {
        status: 'ok',
        user: authUser,
        sessionExpiresAt: session.expiresAt,
        tokens: {
          accessToken,
          refreshToken,
          accessTokenExpiresAt: new Date(Date.now() + MOBILE_ACCESS_TOKEN_TTL_MS).toISOString(),
        },
      };
    }

    const sessionToken = generateOpaqueToken();
    const sessionTokenHash = hashOpaqueToken(sessionToken);
    const session = await this.createSessionRow(user.id, sessionTokenHash, null, wardCodeVersionId, context, WEB_SESSION_TTL_MS);

    await this.audit.record({
      wardId: user.wardId,
      actorUserId: user.id,
      action: 'auth.login.success',
      entityType: 'UserSession',
      entityId: session.id,
      metadata: { clientType: 'web' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return { status: 'ok', user: authUser, sessionToken, sessionExpiresAt: session.expiresAt };
  }

  private async createSessionRow(
    userId: string,
    sessionTokenHash: string,
    refreshTokenHash: string | null,
    wardCodeVersionId: string | null,
    context: RequestContext,
    ttlMs: number,
  ): Promise<UserSession> {
    return this.sessions.create({
      userId,
      sessionTokenHash,
      refreshTokenHash,
      deviceId: context.deviceId,
      wardCodeVersionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      expiresAt: new Date(Date.now() + ttlMs),
    });
  }

  private issueAccessToken(session: UserSession, userId: string): string {
    return signToken<AccessTokenPayload>(
      { purpose: 'access', sessionId: session.id, userId },
      this.config.session.secret,
      MOBILE_ACCESS_TOKEN_TTL_MS,
    );
  }

  async refresh(refreshToken: string, context: RequestContext): Promise<{ tokens: MobileTokenPair }> {
    const refreshTokenHash = hashOpaqueToken(refreshToken);
    const session = await this.sessions.findByRefreshTokenHash(refreshTokenHash);

    if (!session || !isSessionValid(session)) {
      throw new UnauthorizedException('This session is no longer valid. Please sign in again.');
    }

    const newRefreshToken = generateOpaqueToken();
    const newRefreshTokenHash = hashOpaqueToken(newRefreshToken);
    await this.sessions.rotateRefreshToken(session.id, newRefreshTokenHash, new Date(Date.now() + MOBILE_REFRESH_TOKEN_TTL_MS));

    const accessToken = this.issueAccessToken(session, session.userId);

    await this.audit.record({
      actorUserId: session.userId,
      action: 'auth.token.refreshed',
      entityType: 'UserSession',
      entityId: session.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      tokens: {
        accessToken,
        refreshToken: newRefreshToken,
        accessTokenExpiresAt: new Date(Date.now() + MOBILE_ACCESS_TOKEN_TTL_MS).toISOString(),
      },
    };
  }

  async validateAccessToken(accessToken: string): Promise<{ user: AuthUser; session: UserSession }> {
    let payload: AccessTokenPayload;
    try {
      payload = verifyToken<AccessTokenPayload>(accessToken, this.config.session.secret);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    const session = await this.sessions.findById(payload.sessionId);
    if (!session || !isSessionValid(session) || session.userId !== payload.userId) {
      throw new UnauthorizedException('This session is no longer valid.');
    }

    return this.loadAuthUser(session);
  }

  async validateSessionToken(sessionToken: string): Promise<{ user: AuthUser; session: UserSession }> {
    const sessionTokenHash = hashOpaqueToken(sessionToken);
    const session = await this.sessions.findByTokenHash(sessionTokenHash);

    if (!session || !isSessionValid(session)) {
      throw new UnauthorizedException('This session is no longer valid.');
    }

    await this.sessions.touchLastUsed(session.id);
    return this.loadAuthUser(session);
  }

  private async loadAuthUser(session: UserSession): Promise<{ user: AuthUser; session: UserSession }> {
    const user = await this.users.findById(session.userId);
    if (!user || user.disabledAt) {
      throw new UnauthorizedException('This account is no longer active.');
    }

    const permissionKeys = await this.users.getPermissionKeys(user.id);
    return {
      user: {
        id: user.id,
        wardId: user.wardId,
        username: user.username,
        displayName: user.displayName,
        permissions: permissionKeys,
      },
      session,
    };
  }

  async logout(sessionId: string, actorUserId: string, context: RequestContext): Promise<void> {
    await this.sessions.revoke(sessionId);
    await this.audit.record({
      actorUserId,
      action: 'auth.logout',
      entityType: 'UserSession',
      entityId: sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async listSessions(userId: string): Promise<UserSession[]> {
    return this.sessions.listActiveForUser(userId);
  }

  async revokeSession(sessionId: string, requestingUserId: string, context: RequestContext): Promise<void> {
    const session = await this.sessions.findById(sessionId);
    if (!session || session.userId !== requestingUserId) {
      throw new ForbiddenException('You may only revoke your own sessions.');
    }
    await this.sessions.revoke(sessionId);
    await this.audit.record({
      actorUserId: requestingUserId,
      action: 'auth.session.revoked',
      entityType: 'UserSession',
      entityId: sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async disableAccount(targetUserId: string, actorUserId: string, context: RequestContext): Promise<void> {
    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new UnauthorizedException('User not found.');
    }
    await this.users.disable(targetUserId);
    await this.sessions.revokeAllForUser(targetUserId);
    await this.audit.record({
      wardId: target.wardId,
      actorUserId,
      action: 'auth.user.disabled',
      entityType: 'ApplicationUser',
      entityId: targetUserId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async enableAccount(targetUserId: string, actorUserId: string, context: RequestContext): Promise<void> {
    const target = await this.users.findById(targetUserId);
    if (!target) {
      throw new UnauthorizedException('User not found.');
    }
    await this.users.enable(targetUserId);
    await this.audit.record({
      wardId: target.wardId,
      actorUserId,
      action: 'auth.user.enabled',
      entityType: 'ApplicationUser',
      entityId: targetUserId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }
}
