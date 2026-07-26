import { Inject, Injectable } from '@nestjs/common';
import type { AudienceGroup } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type AudienceGroupWithCounts = AudienceGroup & {
  _count: { members: number; destinations: number };
};

export type AudienceGroupWithDetails = AudienceGroup & {
  members: {
    person: { id: string; firstName: string; lastName: string; preferredName: string | null; dateOfBirth: Date | null; archivedAt: Date | null };
  }[];
  destinations: { destination: { id: string; name: string; channel: string } }[];
};

export interface AudienceGroupSearchOptions {
  query?: string;
  includeArchived?: boolean;
}

export interface CreateAudienceGroupInput {
  wardId: string;
  name: string;
  description?: string | null;
}

/**
 * Prisma-backed repository for AudienceGroup. Always scoped by `wardId`
 * so one ward's audiences can never leak into another's queries.
 */
@Injectable()
export class AudienceGroupRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(wardId: string, options: AudienceGroupSearchOptions): Promise<AudienceGroupWithCounts[]> {
    const trimmedQuery = options.query?.trim();

    return this.prisma.client.audienceGroup.findMany({
      where: {
        wardId,
        archivedAt: options.includeArchived ? undefined : null,
        ...(trimmedQuery
          ? {
              OR: [
                { name: { contains: trimmedQuery, mode: 'insensitive' } },
                { description: { contains: trimmedQuery, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { _count: { select: { members: true, destinations: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async findByIdForWard(wardId: string, id: string): Promise<AudienceGroupWithDetails | null> {
    return this.prisma.client.audienceGroup.findFirst({
      where: { id, wardId },
      include: {
        members: {
          include: {
            person: {
              select: { id: true, firstName: true, lastName: true, preferredName: true, dateOfBirth: true, archivedAt: true },
            },
          },
        },
        destinations: { include: { destination: { select: { id: true, name: true, channel: true } } } },
      },
    });
  }

  async findCountsForWard(wardId: string, id: string): Promise<{ memberCount: number; destinationCount: number } | null> {
    const group = await this.prisma.client.audienceGroup.findFirst({
      where: { id, wardId },
      include: { _count: { select: { members: true, destinations: true } } },
    });
    if (!group) return null;
    return { memberCount: group._count.members, destinationCount: group._count.destinations };
  }

  async findByNameForWard(wardId: string, name: string): Promise<AudienceGroup | null> {
    return this.prisma.client.audienceGroup.findFirst({ where: { wardId, name } });
  }

  async create(input: CreateAudienceGroupInput): Promise<AudienceGroup> {
    return this.prisma.client.audienceGroup.create({
      data: { wardId: input.wardId, name: input.name, description: input.description ?? null },
    });
  }

  async update(id: string, input: { name?: string; description?: string | null }): Promise<AudienceGroup> {
    return this.prisma.client.audienceGroup.update({ where: { id }, data: input });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.client.audienceGroup.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async restore(id: string): Promise<void> {
    await this.prisma.client.audienceGroup.update({ where: { id }, data: { archivedAt: null } });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.client.audienceGroup.delete({ where: { id } });
  }
}
