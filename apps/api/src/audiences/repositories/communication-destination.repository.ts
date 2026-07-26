import { Inject, Injectable } from '@nestjs/common';
import type { CommunicationChannel, CommunicationDestination } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateDestinationInput {
  wardId: string;
  name: string;
  channel: CommunicationChannel;
  providerAccountReference?: string | null;
}

/**
 * Prisma-backed repository for CommunicationDestination. Only stores a
 * non-secret provider reference and non-secret configuration — actual
 * provider credentials belong in a managed secret store, added in
 * Phase 9 (see schema.prisma comment on this model and
 * .cursor/rules/security.mdc).
 */
@Injectable()
export class CommunicationDestinationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForWard(wardId: string, includeArchived = false): Promise<CommunicationDestination[]> {
    return this.prisma.client.communicationDestination.findMany({
      where: { wardId, archivedAt: includeArchived ? undefined : null },
      orderBy: { name: 'asc' },
    });
  }

  async findByIdForWard(wardId: string, id: string): Promise<CommunicationDestination | null> {
    return this.prisma.client.communicationDestination.findFirst({ where: { id, wardId } });
  }

  async create(input: CreateDestinationInput): Promise<CommunicationDestination> {
    return this.prisma.client.communicationDestination.create({
      data: {
        wardId: input.wardId,
        name: input.name,
        channel: input.channel,
        providerAccountReference: input.providerAccountReference ?? null,
      },
    });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.client.communicationDestination.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}
