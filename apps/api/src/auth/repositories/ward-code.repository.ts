import { Inject, Injectable } from '@nestjs/common';
import type { WardCodeVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class WardCodeRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Active versions whose lookup key matches — normally zero or one row. */
  async findActiveByLookupKey(lookupKey: string): Promise<WardCodeVersion[]> {
    return this.prisma.client.wardCodeVersion.findMany({
      where: { lookupKey, retiredAt: null, ward: { archivedAt: null } },
    });
  }

  /** Active versions created before lookup keys existed; shrinks to empty as they are backfilled. */
  async listActiveVersionsWithoutLookupKey(): Promise<WardCodeVersion[]> {
    return this.prisma.client.wardCodeVersion.findMany({
      where: { lookupKey: null, retiredAt: null, ward: { archivedAt: null } },
    });
  }

  async setLookupKey(id: string, lookupKey: string): Promise<void> {
    await this.prisma.client.wardCodeVersion.updateMany({
      where: { id, lookupKey: null },
      data: { lookupKey },
    });
  }

  /** The single active (non-retired) ward code version for a ward, if any has been configured. */
  async findActiveVersion(wardId: string): Promise<WardCodeVersion | null> {
    return this.prisma.client.wardCodeVersion.findFirst({
      where: { wardId, retiredAt: null },
      orderBy: { version: 'desc' },
    });
  }

  /**
   * Creates the next ward code version and retires the previous active
   * one in a single transaction, so exactly one version is ever active.
   */
  async rotate(wardId: string, codeHash: string, lookupKey: string): Promise<WardCodeVersion> {
    return this.prisma.client.$transaction(async (tx) => {
      const current = await tx.wardCodeVersion.findFirst({
        where: { wardId, retiredAt: null },
        orderBy: { version: 'desc' },
      });

      if (current) {
        await tx.wardCodeVersion.update({ where: { id: current.id }, data: { retiredAt: new Date() } });
      }

      return tx.wardCodeVersion.create({
        data: {
          wardId,
          version: (current?.version ?? 0) + 1,
          codeHash,
          lookupKey,
          activatedAt: new Date(),
        },
      });
    });
  }
}
