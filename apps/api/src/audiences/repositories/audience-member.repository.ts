import { Inject, Injectable } from '@nestjs/common';
import type { AudienceGroupMember } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Prisma-backed repository for AudienceGroupMember. Membership rows are
 * hard-deleted on removal (unlike Person/PersonRelationship/ContactMethod,
 * they carry no independent history that must be retained — the
 * AuditEvent trail records that the change happened).
 */
@Injectable()
export class AudienceMemberRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listPersonIds(audienceGroupId: string): Promise<string[]> {
    const rows = await this.prisma.client.audienceGroupMember.findMany({
      where: { audienceGroupId },
      select: { personId: true },
    });
    return rows.map((row) => row.personId);
  }

  async add(audienceGroupId: string, personId: string, addedByUserId: string): Promise<AudienceGroupMember> {
    return this.prisma.client.audienceGroupMember.create({
      data: { audienceGroupId, personId, addedByUserId },
    });
  }

  async remove(audienceGroupId: string, personId: string): Promise<void> {
    await this.prisma.client.audienceGroupMember.deleteMany({ where: { audienceGroupId, personId } });
  }

  async countForWard(wardId: string, personId: string): Promise<number> {
    return this.prisma.client.audienceGroupMember.count({
      where: { personId, audienceGroup: { wardId } },
    });
  }
}
