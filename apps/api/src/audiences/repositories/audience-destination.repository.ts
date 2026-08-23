import { Inject, Injectable } from '@nestjs/common';
import type { AudienceDestination } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Prisma-backed repository for the AudienceGroup <-> CommunicationDestination join. */
@Injectable()
export class AudienceDestinationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async add(audienceGroupId: string, destinationId: string): Promise<AudienceDestination> {
    return this.prisma.client.audienceDestination.create({ data: { audienceGroupId, destinationId } });
  }

  async remove(audienceGroupId: string, destinationId: string): Promise<void> {
    await this.prisma.client.audienceDestination.deleteMany({ where: { audienceGroupId, destinationId } });
  }
}
