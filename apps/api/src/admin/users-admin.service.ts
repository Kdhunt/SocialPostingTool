import {
  BadRequestException,
  ConflictException,
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
import { validatePasswordStrength } from '@ward-comms/domain';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { UserRepository } from '../auth/repositories/user.repository.js';
import { RoleRepository } from './repositories/role.repository.js';

export interface AdminActionContext {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

@Injectable()
export class UsersAdminService {
  constructor(
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(RoleRepository) private readonly roles: RoleRepository,
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(AuditService) private readonly audit: AuditService,
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
      roles: rows.map((role) => ({
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

    if (await this.users.isUsernameTaken(wardId, input.username)) {
      throw new ConflictException('A user with that username already exists in this ward.');
    }

    const roleRows = await this.roles.findByIds(input.roleIds);
    if (roleRows.length !== input.roleIds.length) {
      throw new BadRequestException('One or more role IDs are invalid.');
    }

    const passwordHash = await this.passwordHasher.hash(input.password);
    const user = await this.users.create({
      wardId,
      username: input.username,
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
      metadata: { username: user.username, roleIds: input.roleIds },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const created = await this.users.listForWard(wardId);
    const summary = created.find((row) => row.id === user.id);
    if (!summary) throw new Error('Created user not found.');
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

    await this.users.assignRoles(userId, roleIds);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'user.roles_assigned',
      entityType: 'ApplicationUser',
      entityId: userId,
      metadata: { roleIds },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    const rows = await this.users.listForWard(wardId);
    const summary = rows.find((row) => row.id === userId);
    if (!summary) throw new NotFoundException('User not found.');
    return this.toSummary(summary);
  }

  private toSummary(row: {
    id: string;
    username: string;
    displayName: string;
    disabledAt: Date | null;
    lastLoginAt: Date | null;
    roles: Array<{ id: string; name: string }>;
  }): UserSummaryDto {
    return {
      id: row.id,
      username: row.username,
      displayName: row.displayName,
      disabledAt: row.disabledAt?.toISOString() ?? null,
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      roleIds: row.roles.map((role) => role.id),
      roleNames: row.roles.map((role) => role.name),
    };
  }
}
