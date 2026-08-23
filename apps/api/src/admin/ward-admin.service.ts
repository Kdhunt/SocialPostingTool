import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { RotateWardCodeRequest, WardCodeInfoDto } from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import { WardCodeHasherService } from '../auth/ward-code-hasher.service.js';
import { WardCodeRepository } from '../auth/repositories/ward-code.repository.js';
import type { AdminActionContext } from './users-admin.service.js';

@Injectable()
export class WardAdminService {
  constructor(
    @Inject(WardCodeRepository) private readonly wardCodes: WardCodeRepository,
    @Inject(WardCodeHasherService) private readonly wardCodeHasher: WardCodeHasherService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async getActiveCodeInfo(wardId: string): Promise<WardCodeInfoDto | null> {
    const version = await this.wardCodes.findActiveVersion(wardId);
    if (!version) return null;
    return {
      version: version.version,
      activatedAt: version.activatedAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
    };
  }

  async rotate(
    wardId: string,
    input: RotateWardCodeRequest,
    context: AdminActionContext,
  ): Promise<WardCodeInfoDto> {
    const codeHash = await this.wardCodeHasher.hash(input.newWardCode);
    const version = await this.wardCodes.rotate(wardId, codeHash);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'ward_code.rotated',
      entityType: 'WardCodeVersion',
      entityId: version.id,
      metadata: { version: version.version },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      version: version.version,
      activatedAt: version.activatedAt?.toISOString() ?? null,
      createdAt: version.createdAt.toISOString(),
    };
  }

  async requireActiveCodeInfo(wardId: string): Promise<WardCodeInfoDto> {
    const info = await this.getActiveCodeInfo(wardId);
    if (!info) throw new NotFoundException('No active ward code is configured.');
    return info;
  }
}
