import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  CreateUserRequest,
  RoleListResponse,
  UserListResponse,
  UserSummaryDto,
} from '@ward-comms/validation';
import { normalizeEmail, validatePasswordStrength } from '@ward-comms/domain';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { UserRepository } from '../auth/repositories/user.repository.js';
import { SessionRepository } from '../auth/repositories/session.repository.js';
import { RoleRepository } from './repositories/role.repository.js';
import { AccountEmailService } from '../messaging/account-email.service.js';

export interface AdminActionContext {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

const PLATFORM_ADMIN_ROLE = 'PlatformAdmin';

@Injectable()
export class UsersAdminService {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RoleRepository) private readonly roles: RoleRepository,
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(SessionRepository) private readonly sessions: SessionRepository,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AccountEmailService) private readonly accountEmail: AccountEmailService,
  ) {}

  async list(wardId: string): Promise<UserListResponse> {
    const rows = await this.users.listForWard(wardId);
    return {
      users: rows.map((row) => this.toSummary(row)),
    };
  }

  async listRoles(): Promise<RoleListResponse> {
    const rows = await this.roles.listAll();
    return {
      roles: rows
        .filter((role) => role.name !== PLATFORM_ADMIN_ROLE)
        .map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
        })),
    };
  }

  async create(
    wardId: string,
    input: CreateUserRequest,
    context: AdminActionContext,
  ): Promise<UserSummaryDto> {
    const passwordCheck = validatePasswordStrength(input.password);
    if (!passwordCheck.valid) {
      throw new BadRequestException(passwordCheck.errors.join(' '));
    }

    const email = normalizeEmail(input.email);
    if (!email) {
      throw new BadRequestException('Enter a valid email address.');
    }

    if (await this.users.isUsernameTaken(wardId, input.username)) {
      throw new ConflictException('A user with that username already exists in this ward.');
    }

    if (await this.users.isEmailTaken(wardId, email)) {
      throw new ConflictException('A user with that email already exists in this ward.');
    }

    const roleRows = await this.roles.findByIds(input.roleIds);
    if (roleRows.length !== input.roleIds.length) {
      throw new BadRequestException('One or more role IDs are invalid.');
    }
    this.rejectPlatformAdminAssignment(roleRows);

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.users.create({
      wardId,
      username: input.username,
      email,
      displayName: input.displayName,
      passwordHash,
      roleIds: input.roleIds,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'user.created',
      entityType: 'ApplicationUser',
      entityId: user.id,
      metadata: { username: user.username, email: user.email, roleIds: input.roleIds },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    try {
      await this.accountEmail.queueVerificationForUser(user.id, context);
    } catch {
      // User is persisted; admin can resend verification if the outbox send failed.
    }

    const created = await this.users.listForWard(wardId);
    const summary = created.find((row) => row.id === user.id);
    if (!summary) throw new Error('Created user not found.');
    return this.toSummary(summary);
  }

  async sendVerificationEmail(wardId: string, userId: string, context: AdminActionContext): Promise<void> {
    const user = await this.users.findByIdForWard(wardId, userId);
    if (!user) throw new NotFoundException('User not found.');
    await this.accountEmail.queueVerificationForUser(userId, context);
  }

  async sendPasswordResetEmail(wardId: string, userId: string, context: AdminActionContext): Promise<void> {
    const user = await this.users.findByIdForWard(wardId, userId);
    if (!user) throw new NotFoundException('User not found.');
    await this.accountEmail.queuePasswordResetForUser(userId, context);
  }

  async updateEmail(
    wardId: string,
    userId: string,
    email: string,
    context: AdminActionContext,
  ): Promise<UserSummaryDto> {
    const user = await this.users.findByIdForWard(wardId, userId);
    if (!user) throw new NotFoundException('User not found.');

    await this.accountEmail.changeEmailForUser(userId, email, context);

    const rows = await this.users.listForWard(wardId);
    const summary = rows.find((row) => row.id === userId);
    if (!summary) throw new NotFoundException('User not found.');
    return this.toSummary(summary);
  }

  async assignRoles(
    wardId: string,
    userId: string,
    roleIds: string[],
    context: AdminActionContext,
  ): Promise<UserSummaryDto> {
    const user = await this.users.findByIdForWard(wardId, userId);
    if (!user) throw new NotFoundException('User not found.');

    const roleRows = await this.roles.findByIds(roleIds);
    if (roleRows.length !== roleIds.length) {
      throw new BadRequestException('One or more role IDs are invalid.');
    }
    this.rejectPlatformAdminAssignment(roleRows);

    const nextRoleIds = [...roleIds];
    if (await this.users.hasRole(userId, PLATFORM_ADMIN_ROLE)) {
      const platformAdmin = await this.roles.findByName(PLATFORM_ADMIN_ROLE);
      if (platformAdmin && !nextRoleIds.includes(platformAdmin.id)) {
        nextRoleIds.push(platformAdmin.id);
      }
    }

    await this.users.assignRoles(userId, nextRoleIds);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'user.roles_assigned',
      entityType: 'ApplicationUser',
      entityId: userId,
      metadata: { roleIds: nextRoleIds },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const rows = await this.users.listForWard(wardId);
    const summary = rows.find((row) => row.id === userId);
    if (!summary) throw new NotFoundException('User not found.');
    return this.toSummary(summary);
  }

  async resetPassword(
    wardId: string,
    userId: string,
    password: string,
    context: AdminActionContext,
  ): Promise<void> {
    const user = await this.users.findByIdForWard(wardId, userId);
    if (!user) throw new NotFoundException('User not found.');

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      throw new BadRequestException(passwordCheck.errors.join(' '));
    }

    const passwordHash = await this.passwordHasher.hash(password);
    await this.users.setPasswordHash(userId, passwordHash);
    await this.sessions.revokeAllForUser(userId);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'user.password_reset',
      entityType: 'ApplicationUser',
      entityId: userId,
      metadata: { username: user.username },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private rejectPlatformAdminAssignment(roles: Array<{ name: string }>): void {
    if (roles.some((role) => role.name === PLATFORM_ADMIN_ROLE)) {
      throw new ForbiddenException('PlatformAdmin cannot be assigned from ward user management.');
    }
  }

  private toSummary(row: {
    id: string;
    username: string;
    email: string | null;
    emailVerifiedAt: Date | null;
    displayName: string;
    disabledAt: Date | null;
    lastLoginAt: Date | null;
    roles: Array<{ id: string; name: string }>;
  }): UserSummaryDto {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      emailVerifiedAt: row.emailVerifiedAt?.toISOString() ?? null,
      displayName: row.displayName,
      disabledAt: row.disabledAt?.toISOString() ?? null,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      roleIds: row.roles.map((role) => role.id),
      roleNames: row.roles.map((role) => role.name),
    };
  }
}
