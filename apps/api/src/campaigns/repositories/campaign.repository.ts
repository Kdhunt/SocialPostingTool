import { Inject, Injectable } from '@nestjs/common';
import type { Campaign, CampaignStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type CampaignWithCurrentVersionCount = Campaign & { _count: { versions: number } };

export interface CampaignSearchOptions {
  query?: string;
  status?: CampaignStatus;
  includeArchived?: boolean;
}

/**
 * Prisma-backed repository for Campaign. Contains no lifecycle or content
 * rules — those live in CampaignsService and @ward-comms/domain — only
 * data access, always scoped by `wardId`.
 */
@Injectable()
export class CampaignRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(wardId: string, options: CampaignSearchOptions): Promise<CampaignWithCurrentVersionCount[]> {
    const trimmedQuery = options.query?.trim();

    return this.prisma.client.campaign.findMany({
      where: {
        wardId,
        archivedAt: options.includeArchived ? undefined : null,
        status: options.status,
        ...(trimmedQuery ? { name: { contains: trimmedQuery, mode: 'insensitive' } } : {}),
      },
      include: { _count: { select: { versions: true } } },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findByIdForWard(wardId: string, id: string): Promise<Campaign | null> {
    return this.prisma.client.campaign.findFirst({ where: { id, wardId } });
  }

  async create(input: { wardId: string; name: string; createdByUserId: string }): Promise<Campaign> {
    return this.prisma.client.campaign.create({
      data: { wardId: input.wardId, name: input.name, createdByUserId: input.createdByUserId },
    });
  }

  async updateName(id: string, name: string): Promise<Campaign> {
    return this.prisma.client.campaign.update({ where: { id }, data: { name } });
  }

  async updateStatus(id: string, status: CampaignStatus): Promise<Campaign> {
    return this.prisma.client.campaign.update({ where: { id }, data: { status } });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.client.campaign.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}
