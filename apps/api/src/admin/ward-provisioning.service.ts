import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateWardRequest,
  CreateWardResponse,
  PlatformWardSummaryDto,
  RotateWardCodeRequest,
  SetUnitParentRequest,
  UnitTreeResponse,
  UpdateWardPublicSlugRequest,
  WardCodeInfoDto,
  WardListResponse,
  WardSummaryDto,
} from '@ward-comms/validation';
import {
  checkParentAssignment,
  parentLevelOf,
  unitNoun,
  type UnitLevel,
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
import { UnitCodeLookupService } from '../auth/unit-code-lookup.service.js';
import { UnitScopeService, type UnitRef } from './unit-scope.service.js';

/**
 * Who is creating or moving a unit. Platform operators may place units
 * anywhere; a unit admin may only work strictly beneath their own unit.
 */
export type UnitActorScope = { kind: 'platform' } | { kind: 'unit'; unitId: string };

const PARENT_PROBLEM_MESSAGES = {
  wrong_level: (level: UnitLevel) =>
    `A ${unitNoun(level)} must sit directly under a ${unitNoun(parentLevelOf(level) ?? level)}.`,
  self: () => 'A unit cannot be its own parent.',
  cycle: () => 'A unit cannot be placed beneath one of its own units.',
} as const;

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
    @Inject(UnitCodeLookupService) private readonly unitCodes: UnitCodeLookupService,
    @Inject(UnitScopeService) private readonly scope: UnitScopeService,
  ) {}

  /**
   * Validates placing a unit of `level` (optionally an existing unit, `unitId`)
   * under `parentId`, within what `actor` is allowed to touch.
   */
  private async resolveParent(
    level: UnitLevel,
    parentId: string | null | undefined,
    actor: UnitActorScope,
    unitId: string | null,
  ): Promise<string | null> {
    const units = await this.scope.loadActive();

    if (!parentId) {
      if (actor.kind === 'unit') {
        throw new BadRequestException('Choose which unit this belongs under.');
      }
      return null;
    }

    const parent = units.get(parentId);
    // One message whether the parent is missing or outside the actor's tree,
    // so a unit admin cannot use this to confirm other units' IDs.
    const unavailable = new BadRequestException('The selected parent unit is not available.');
    if (!parent) {
      throw unavailable;
    }
    if (actor.kind === 'unit' && parent.id !== actor.unitId) {
      try {
        await this.scope.assertBeneath(actor.unitId, parent.id);
      } catch {
        throw unavailable;
      }
    }

    const candidate: UnitRef = { id: unitId ?? '__new__', parentId: null, level };
    const problem = checkParentAssignment(candidate, parent, units);
    if (problem) {
      throw new BadRequestException(PARENT_PROBLEM_MESSAGES[problem](level));
    }
    return parent.id;
  }

  /**
   * Hierarchy actions are visible in two audit logs: the unit acted on, and
   * (for unit admins) the admin's own unit, so a stake's log shows what its
   * admins did to the wards beneath it.
   */
  private async recordForActorAndTarget(
    actor: UnitActorScope,
    targetUnitId: string,
    event: Omit<Parameters<AuditService['record']>[0], 'wardId'>,
  ): Promise<void> {
    await this.audit.record({ ...event, wardId: targetUnitId });
    if (actor.kind === 'unit' && actor.unitId !== targetUnitId) {
      await this.audit.record({ ...event, wardId: actor.unitId, metadata: { ...event.metadata, targetUnitId } });
    }
  }

  /** Places an existing unit under a new parent (or detaches it, platform only). */
  async setParent(
    unitId: string,
    input: SetUnitParentRequest,
    actor: UnitActorScope,
    context: AdminActionContext,
  ): Promise<WardSummaryDto> {
    const ward = await this.wards.findActiveById(unitId);
    if (!ward) throw new NotFoundException('Unit not found.');
    if (actor.kind === 'unit') {
      await this.scope.assertBeneath(actor.unitId, unitId);
    }

    const parentId = await this.resolveParent(ward.level, input.parentId, actor, unitId);
    const updated = await this.prisma.client.ward.update({ where: { id: unitId }, data: { parentId } });
    await this.recordForActorAndTarget(actor, unitId, {
      actorUserId: context.actorUserId,
      action: 'unit.parent.updated',
      entityType: 'Ward',
      entityId: unitId,
      metadata: { fromParentId: ward.parentId, toParentId: parentId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
    return this.toSummary(updated);
  }

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

  /** The actor's own unit and every active unit beneath it, with their admins. */
  async listBeneath(unitId: string): Promise<UnitTreeResponse> {
    const own = await this.wards.findActiveById(unitId);
    if (!own) throw new NotFoundException('Unit not found.');
    const ids = await this.scope.descendantsOf(unitId);
    const rows = ids.length > 0 ? await this.wards.listActiveWithAdmins(ids) : [];
    return {
      unit: this.toSummary(own),
      units: rows.map((row): PlatformWardSummaryDto => ({ ...this.toSummary(row), admins: row.admins })),
    };
  }

  async create(
    input: CreateWardRequest,
    context: AdminActionContext,
    actor: UnitActorScope = { kind: 'platform' },
  ): Promise<CreateWardResponse> {
    const level: UnitLevel = input.level ?? 'Ward';
    const parentId = await this.resolveParent(level, input.parentId, actor, null);

    const passwordCheck = validatePasswordStrength(input.adminPassword);
    if (!passwordCheck.valid) {
      throw new BadRequestException(passwordCheck.errors.join(' '));
    }

    const timeZone = input.timeZone ?? 'America/Denver';
    if (!isValidTimeZone(timeZone)) {
      throw new BadRequestException('Enter a valid IANA time zone (for example, America/Denver).');
    }

    if (await this.wards.findActiveByNameUnderParent(input.name, parentId)) {
      throw new ConflictException(
        parentId
          ? 'A unit with that name already exists under the same parent.'
          : 'A top-level unit with that name already exists.',
      );
    }

    const wardAdminRole = await this.roles.findByName('WardAdmin');
    if (!wardAdminRole) {
      throw new BadRequestException('WardAdmin role is not configured. Run the database seed.');
    }

    const adminEmail = normalizeEmail(input.adminEmail);
    if (!adminEmail) {
      throw new BadRequestException('Enter a valid email address.');
    }

    const unitCode = input.initialWardCode.trim();
    await this.unitCodes.assertAvailable(unitCode, null);

    const passwordHash = await this.passwordHasher.hash(input.adminPassword);
    const codeHash = await this.wardCodeHasher.hash(unitCode);
    const publicSlug = await this.allocatePublicSlug(input.publicSlug, input.name);

    const result = await this.prisma.client.$transaction(async (tx) => {
      const ward = await tx.ward.create({
        data: { name: input.name, timeZone, publicSlug, level, parentId },
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
          lookupKey: this.wardCodeHasher.lookupKey(unitCode),
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

    await this.recordForActorAndTarget(actor, result.ward.id, {
      actorUserId: context.actorUserId,
      action: actor.kind === 'platform' ? 'platform.ward.created' : 'unit.created',
      entityType: 'Ward',
      entityId: result.ward.id,
      metadata: {
        wardName: result.ward.name,
        level,
        parentId,
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
    level: UnitLevel;
    parentId: string | null;
    publicSlug: string;
    timeZone: string;
    createdAt: Date;
  }): WardSummaryDto {
    return {
      id: ward.id,
      name: ward.name,
      level: ward.level,
      parentId: ward.parentId,
      publicSlug: ward.publicSlug,
      timeZone: ward.timeZone,
      createdAt: ward.createdAt.toISOString(),
    };
  }
}
