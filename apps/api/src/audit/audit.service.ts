import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface RecordAuditEventInput {
  wardId?: string | null;
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  /**
   * Structured, non-secret context for the event. Callers MUST NOT include
   * passwords, ward codes, tokens, or more personal data than the action
   * requires (see .cursor/rules/security.mdc: "redact personal data from
   * logs").
   */
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Append-only audit event writer shared by every feature module. Audit
 * events are never deleted or edited (AGENTS.md #12) — this service only
 * ever creates rows.
 */
@Injectable()
export class AuditService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async record(input: RecordAuditEventInput): Promise<void> {
    await this.prisma.client.auditEvent.create({
      data: {
        wardId: input.wardId ?? null,
        actorUserId: input.actorUserId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        metadata: (input.metadata as Prisma.InputJsonValue | undefined) ?? undefined,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      },
    });
  }
}
