import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { CreateWardRequest, CreateWardResponse, WardListResponse, WardSummaryDto } from '@ward-comms/validation';
import { validatePasswordStrength } from '@ward-comms/domain';
import { AuditService } from '../audit/audit.service.js';
import { PasswordHasherService } from '../auth/password-hasher.service.js';
import { WardCodeHasherService } from '../auth/ward-code-hasher.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RoleRepository } from './repositories/role.repository.js';
import { WardRepository } from './repositories/ward.repository.js';
import type { AdminActionContext } from './users-admin.service.js';

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
    @Inject(PasswordHasherService) private readonly passwordHasher: PasswordHasherService,
    @Inject(WardCodeHasherService) private readonly wardCodeHasher: WardCodeHasherService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(): Promise<WardListResponse> {
    const rows = await this.wards.listActive();
    return { wards: rows.map((ward) => this.toSummary(ward)) };
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

    const passwordHash = await this.passwordHasher.hash(input.adminPassword);
    const codeHash = await this.wardCodeHasher.hash(input.initialWardCode);

    const result = await this.prisma.client.$transaction(async (tx) => {
      const ward = await tx.ward.create({
        data: { name: input.name, timeZone },
      });

      const adminUser = await tx.applicationUser.create({
        data: {
          wardId: ward.id,
          username: input.adminUsername,
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

    await this.audit.record({
      wardId: result.ward.id,
      actorUserId: context.actorUserId,
      action: 'platform.ward.created',
      entityType: 'Ward',
      entityId: result.ward.id,
      metadata: {
        wardName: result.ward.name,
        adminUsername: result.adminUser.username,
        adminUserId: result.adminUser.id,
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      ward: this.toSummary(result.ward),
      adminUserId: result.adminUser.id,
      adminUsername: result.adminUser.username,
    };
  }

  private toSummary(ward: { id: string; name: string; timeZone: string; createdAt: Date }): WardSummaryDto {
    return {
      id: ward.id,
      name: ward.name,
      timeZone: ward.timeZone,
      createdAt: ward.createdAt.toISOString(),
    };
  }
}
