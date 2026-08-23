import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AuditListResponse, AuditSearchQuery } from '@ward-comms/validation';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class AuditQueryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async list(wardId: string, query: AuditSearchQuery): Promise<AuditListResponse> {
    const limit = query.limit ?? 50;
    const where: Prisma.AuditEventWhereInput = { wardId };
    if (query.action) where.action = query.action;
    if (query.entityType) where.entityType = query.entityType;

    const events = await this.prisma.client.auditEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { actor: { select: { displayName: true } } },
    });

    return {
      events: events.map((event) => ({
        id: event.id,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        actorUserId: event.actorUserId,
        actorDisplayName: event.actor?.displayName ?? null,
        metadata: (event.metadata as Record<string, unknown> | null) ?? null,
        ipAddress: event.ipAddress,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  }
}
