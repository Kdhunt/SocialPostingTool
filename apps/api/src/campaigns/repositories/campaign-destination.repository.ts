import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Prisma-backed repository for CampaignDestination — the resolved,
 * deduplicated set of active destinations for a campaign version's current
 * audience selection. `replaceForVersion` is a full replace (delete +
 * recreate) rather than a diff, since resolution always recomputes the
 * complete set from scratch.
 */
@Injectable()
export class CampaignDestinationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async replaceForVersion(campaignVersionId: string, destinationIds: string[]): Promise<void> {
    await this.prisma.client.$transaction([
      this.prisma.client.campaignDestination.deleteMany({ where: { campaignVersionId } }),
      ...(destinationIds.length > 0
        ? [
            this.prisma.client.campaignDestination.createMany({
              data: destinationIds.map((destinationId) => ({ campaignVersionId, destinationId })),
            }),
          ]
        : []),
    ]);
  }
}
