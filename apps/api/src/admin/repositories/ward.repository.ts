import { Inject, Injectable } from '@nestjs/common';
import type { Ward } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class WardRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listActive(): Promise<Ward[]> {
    return this.prisma.client.ward.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async findActiveByName(name: string): Promise<Ward | null> {
    return this.prisma.client.ward.findFirst({
      where: { name, archivedAt: null },
    });
  }
}
