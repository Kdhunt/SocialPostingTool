import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { descendantIds, isStrictAncestor, type UnitLevel } from '@ward-comms/domain';
import { PrismaService } from '../prisma/prisma.service.js';

export interface UnitRef {
  id: string;
  parentId: string | null;
  level: UnitLevel;
}

/**
 * Answers "may an admin of unit A act on unit B?" for the hierarchy:
 * only when A is strictly above B. Never siblings, never upward, and never
 * the admin's own unit through these routes (that has its own settings).
 */
@Injectable()
export class UnitScopeService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Every active unit's position. Unit counts are small, so one query is fine. */
  async loadActive(): Promise<Map<string, UnitRef>> {
    const rows = await this.prisma.client.ward.findMany({
      where: { archivedAt: null },
      select: { id: true, parentId: true, level: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async descendantsOf(unitId: string): Promise<string[]> {
    const units = await this.loadActive();
    return descendantIds(unitId, [...units.values()]);
  }

  /** Throws unless `targetUnitId` is an active unit strictly beneath `actorUnitId`. */
  async assertBeneath(actorUnitId: string, targetUnitId: string): Promise<UnitRef> {
    const units = await this.loadActive();
    const target = units.get(targetUnitId);
    if (!target) {
      throw new NotFoundException('Unit not found.');
    }
    if (!isStrictAncestor(actorUnitId, targetUnitId, units)) {
      // Same answer as a missing unit, so admins cannot probe other trees.
      throw new NotFoundException('Unit not found.');
    }
    return target;
  }
}
