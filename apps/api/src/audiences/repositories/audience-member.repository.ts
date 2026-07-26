import { Inject, Injectable } from '@nestjs/common';
import type { AudienceGroupMember, AudienceMemberSource } from '@prisma/client';
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

  async add(
    audienceGroupId: string,
    personId: string,
    addedByUserId: string,
    source: AudienceMemberSource = 'Manual',
  ): Promise<AudienceGroupMember> {
    return this.prisma.client.audienceGroupMember.create({
      data: { audienceGroupId, personId, addedByUserId, source },
    });
  }

  async remove(audienceGroupId: string, personId: string): Promise<void> {
    await this.prisma.client.audienceGroupMember.deleteMany({ where: { audienceGroupId, personId } });
  }

  async removeBySource(audienceGroupId: string, source: AudienceMemberSource): Promise<number> {
    const result = await this.prisma.client.audienceGroupMember.deleteMany({ where: { audienceGroupId, source } });
    return result.count;
  }

  async replaceRuleMembers(
    audienceGroupId: string,
    personIds: string[],
    addedByUserId: string,
  ): Promise<{ removedCount: number; addedCount: number }> {
    return this.prisma.client.$transaction(async (tx) => {
      const removed = await tx.audienceGroupMember.deleteMany({ where: { audienceGroupId, source: 'Rules' } });
      if (personIds.length > 0) {
        await tx.audienceGroupMember.createMany({
          data: personIds.map((personId) => ({
            audienceGroupId,
            personId,
            addedByUserId,
            source: 'Rules' as const,
          })),
          skipDuplicates: true,
        });
      }
      return { removedCount: removed.count, addedCount: personIds.length };
    });
  }

  async countForWard(wardId: string, personId: string): Promise<number> {
    return this.prisma.client.audienceGroupMember.count({
      where: { personId, audienceGroup: { wardId } },
    });
  }
}
