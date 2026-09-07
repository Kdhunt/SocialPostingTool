import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateWardRequest,
  CreateWardResponse,
  PlatformWardSummaryDto,
  RotateWardCodeRequest,
  UpdateWardPublicSlugRequest,
  WardCodeInfoDto,
  WardListResponse,
  WardSummaryDto,
} from '@ward-comms/validation';
import {
  assertPublicWardSlug,
  fallbackPublicWardSlug,
  isReservedPublicWardSlug,
  normalizeEmail,
  publicWardSlugFromName,
  validatePasswordStrength,
} from '@ward-comms/domain';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { WardCodeHasherService } from '../auth/ward-code-hasher.service.js';
import { UserRepository } from '../auth/repositories/user.repository.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoleRepository } from './repositories/role.repository.js';
import { WardRepository } from './repositories/ward.repository.js';
import type { AdminActionContext } from './users-admin.service.js';
import { UsersAdminService } from './users-admin.service.js';
import { AccountEmailService } from '../messaging/account-email.service.js';
import { WardAdminService } from './ward-admin.service.js';

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone });
    return true;
  } catch {
    return false;
  }
}

@Injectable()
export class WardProvisioningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WardRepository) private readonly wards: WardRepository,
    @Inject(RoleRepository) private readonly roles: RoleRepository,
    @Inject(UserRepository) private readonly users: UserRepository,
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(WardCodeHasherService) private readonly wardCodeHasher: WardCodeHasherService,
    @Inject(WardAdminService) private readonly wardAdmin: WardAdminService,
    @Inject(UsersAdminService) private readonly usersAdmin: UsersAdminService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(AccountEmailService) private readonly accountEmail: AccountEmailService,
  ) {}

  async list(): Promise<WardListResponse> {
    const rows = await this.wards.listActiveWithAdmins();
    return {
      wards: rows.map(
        (ward): PlatformWardSummaryDto => ({
          ...this.toSummary(ward),
          admins: ward.admins,
        }),
      ),
    };
  }

  async create(input: CreateWardRequest, context: AdminActionContext): Promise<CreateWardResponse> {
    const passwordCheck = validatePasswordStrength(input.adminPassword);
    if (!passwordCheck.valid) {
      throw new BadRequestException(passwordCheck.errors.join(' '));
    }

    const timeZone = input.timeZone ?? 'America/Denver';
    if (!isValidTimeZone(timeZone)) {
      throw new BadRequestException('Enter a valid IANA time zone (for example, America/Denver).');
    }

    if (await this.wards.findActiveByName(input.name)) {
      throw new ConflictException('An active ward with that name already exists.');
    }

    const wardAdminRole = await this.roles.findByName('WardAdmin');
    if (!wardAdminRole) {
      throw new BadRequestException('WardAdmin role is not configured. Run the database seed.');
    }

    const adminEmail = normalizeEmail(input.adminEmail);
    if (!adminEmail) {
      throw new BadRequestException('Enter a valid email address.');
    }

    const passwordHash = await this.passwordHasher.hash(input.adminPassword);
    const codeHash = await this.wardCodeHasher.hash(input.initialWardCode);
    const publicSlug = await this.allocatePublicSlug(input.publicSlug, input.name);

    const result = await this.prisma.client.$transaction(async (tx) => {
      const ward = await tx.ward.create({
        data: { name: input.name, timeZone, publicSlug },
      });

      const adminUser = await tx.applicationUser.create({
        data: {
          wardId: ward.id,
          username: input.adminUsername,
          email: adminEmail,
          displayName: input.adminDisplayName,
          passwordHash,
          passwordUpdatedAt: new Date(),
        },
      });

      await tx.userRole.create({
        data: { userId: adminUser.id, roleId: wardAdminRole.id },
      });

      await tx.wardCodeVersion.create({
        data: {
          wardId: ward.id,
          version: 1,
          codeHash,
          activatedAt: new Date(),
        },
      });

      return { ward, adminUser };
    });

    try {
      await this.accountEmail.queueVerificationForUser(result.adminUser.id, context);
    } catch {
      // Ward and admin are persisted; verification can be resent.
    }

    await this.audit.record({
      wardId: result.ward.id,
      actorUserId: context.actorUserId,
      action: 'platform.ward.created',
      entityType: 'Ward',
      entityId: result.ward.id,
      metadata: {
        wardName: result.ward.name,
        adminUsername: result.adminUser.username,
        adminEmail: result.adminUser.email,
        adminUserId: result.adminUser.id,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      ward: this.toSummary(result.ward),
      adminUserId: result.adminUser.id,
      adminUsername: result.adminUser.username,
      adminEmail: result.adminUser.email ?? adminEmail,
    };
  }

  async rotateWardCode(
    wardId: string,
    input: RotateWardCodeRequest,
    context: AdminActionContext,
  ): Promise<WardCodeInfoDto> {
    const ward = await this.wards.findActiveById(wardId);
    if (!ward) throw new NotFoundException('Ward not found.');
    return this.wardAdmin.rotate(wardId, input, context);
  }

  async resetWardAdminPassword(
    wardId: string,
    userId: string,
    password: string,
    context: AdminActionContext,
  ): Promise<void> {
    const ward = await this.wards.findActiveById(wardId);
    if (!ward) throw new NotFoundException('Ward not found.');

    const target = await this.users.findByIdForWard(wardId, userId);
    if (!target) throw new NotFoundException('User not found.');

    if (!(await this.users.hasRole(userId, 'WardAdmin'))) {
      throw new BadRequestException('That user is not a ward administrator.');
    }

    await this.usersAdmin.resetPassword(wardId, userId, password, context);
  }

  async sendWardAdminPasswordResetEmail(
    wardId: string,
    userId: string,
    context: AdminActionContext,
  ): Promise<void> {
    const ward = await this.wards.findActiveById(wardId);
    if (!ward) throw new NotFoundException('Ward not found.');

    const target = await this.users.findByIdForWard(wardId, userId);
    if (!target) throw new NotFoundException('User not found.');

    if (!(await this.users.hasRole(userId, 'WardAdmin'))) {
      throw new BadRequestException('That user is not a ward administrator.');
    }

    await this.usersAdmin.sendPasswordResetEmail(wardId, userId, context);
  }

  async updatePublicSlug(
    wardId: string,
    input: UpdateWardPublicSlugRequest,
    context: AdminActionContext,
  ): Promise<WardSummaryDto> {
    const ward = await this.wards.findActiveById(wardId);
    if (!ward) {
      throw new NotFoundException('Ward not found.');
    }

    let publicSlug: string;
    try {
      publicSlug = assertPublicWardSlug(input.publicSlug);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid public page path.');
    }

    const taken = await this.wards.findByPublicSlug(publicSlug);
    if (taken && taken.id !== ward.id) {
      throw new ConflictException('That public page path is already in use.');
    }

    const updated = await this.wards.updatePublicSlug(ward.id, publicSlug);
    await this.audit.record({
      wardId: ward.id,
      actorUserId: context.actorUserId,
      action: 'ward.public_slug.updated',
      entityType: 'Ward',
      entityId: ward.id,
      metadata: { publicSlug },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return this.toSummary(updated);
  }

  private async allocatePublicSlug(requested: string | undefined, wardName: string): Promise<string> {
    let candidate: string;
    try {
      if (requested) {
        candidate = assertPublicWardSlug(requested);
      } else {
        const fromName = publicWardSlugFromName(wardName);
        candidate =
          fromName.length >= 2 && !isReservedPublicWardSlug(fromName)
            ? assertPublicWardSlug(fromName)
            : fallbackPublicWardSlug(randomUUID());
      }
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Invalid public page path.');
    }

    if (!(await this.wards.findByPublicSlug(candidate))) {
      return candidate;
    }
    if (requested) {
      throw new ConflictException('That public page path is already in use.');
    }

    for (let index = 2; index < 100; index += 1) {
      const suffix = String(index);
      const next = `${candidate.slice(0, 64 - suffix.length)}${suffix}`;
      if (!(await this.wards.findByPublicSlug(next))) {
        return next;
      }
    }

    return fallbackPublicWardSlug(randomUUID());
  }

  private toSummary(ward: {
    id: string;
    name: string;
    publicSlug: string;
    timeZone: string;
    createdAt: Date;
  }): WardSummaryDto {
    return {
      id: ward.id,
      name: ward.name,
      publicSlug: ward.publicSlug,
      timeZone: ward.timeZone,
      createdAt: ward.createdAt.toISOString(),
    };
  }
}
