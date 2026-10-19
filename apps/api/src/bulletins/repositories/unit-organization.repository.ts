import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, UnitOrganization } from '@prisma/client';
import { DEFAULT_UNIT_ORGANIZATIONS } from '@ward-comms/domain';
import { PrismaService } from '../../prisma/prisma.service.js';

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

  async create(wardId: string, name: string, sortOrder: number): Promise<UnitOrganization> {
    return this.prisma.client.unitOrganization.create({ data: { wardId, name, sortOrder } });
  }

  async rename(id: string, name: string): Promise<UnitOrganization> {
    return this.prisma.client.unitOrganization.update({ where: { id }, data: { name } });
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
