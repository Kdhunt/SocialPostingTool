import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, UnitOrganization } from '@prisma/client';
import { DEFAULT_UNIT_ORGANIZATIONS, sameOrganizationName } from '@ward-comms/domain';
import { PrismaService } from '../../prisma/prisma.service.js';

/** An active organization in the unit already has that name. */
export class OrganizationNameConflictError extends Error {}

@Injectable()
export class UnitOrganizationRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listActive(wardId: string): Promise<UnitOrganization[]> {
    return this.prisma.client.unitOrganization.findMany({
      where: { wardId, archivedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async findForWard(wardId: string, id: string): Promise<UnitOrganization | null> {
    return this.prisma.client.unitOrganization.findFirst({ where: { id, wardId } });
  }

  /** IDs (active or archived) that belong to this unit, out of the given ones. */
  async filterOwnedIds(wardId: string, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const rows = await this.prisma.client.unitOrganization.findMany({
      where: { wardId, id: { in: ids } },
      select: { id: true },
    });
    return new Set(rows.map((row) => row.id));
  }

  /**
   * Creates (no `id`) or renames an organization, refusing a name another
   * active organization in the unit already has. Serialized per unit so two
   * simultaneous requests cannot both pass the check.
   */
  async saveUniqueName(wardId: string, name: string, id: string | null): Promise<UnitOrganization> {
    return this.prisma.client.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`unit-organizations:${wardId}`}))`;
      const active = await tx.unitOrganization.findMany({ where: { wardId, archivedAt: null } });
      if (active.some((row) => row.id !== id && sameOrganizationName(row.name, name))) {
        throw new OrganizationNameConflictError();
      }
      if (id) {
        return tx.unitOrganization.update({ where: { id }, data: { name } });
      }
      const sortOrder = active.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;
      return tx.unitOrganization.create({ data: { wardId, name, sortOrder } });
    });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.client.unitOrganization.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
  }

  /** Gives a new unit the default organizations. Call inside the unit-creation transaction. */
  static async createDefaults(tx: Prisma.TransactionClient, wardId: string): Promise<void> {
    await tx.unitOrganization.createMany({
      data: DEFAULT_UNIT_ORGANIZATIONS.map((name, sortOrder) => ({ wardId, name, sortOrder })),
    });
  }
}
