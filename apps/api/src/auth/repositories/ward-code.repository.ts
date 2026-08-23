import { Inject, Injectable } from '@nestjs/common';
import type { WardCodeVersion } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class WardCodeRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

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
  async rotate(wardId: string, codeHash: string): Promise<WardCodeVersion> {
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
          activatedAt: new Date(),
        },
      });
    });
  }
}
