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

  async findActiveById(id: string): Promise<Ward | null> {
    return this.prisma.client.ward.findFirst({
      where: { id, archivedAt: null },
    });
  }

  async listActiveWithAdmins(): Promise<
    Array<{
      id: string;
      name: string;
      timeZone: string;
      createdAt: Date;
      admins: Array<{ id: string; username: string; email: string | null; displayName: string }>;
    }>
  > {
    const rows = await this.prisma.client.ward.findMany({
      where: { archivedAt: null },
      orderBy: { name: 'asc' },
      include: {
        users: {
          where: { archivedAt: null, roles: { some: { role: { name: 'WardAdmin' } } } },
          select: { id: true, username: true, email: true, displayName: true },
          orderBy: { username: 'asc' },
        },
      },
    });

    return rows.map((ward) => ({
      id: ward.id,
      name: ward.name,
      timeZone: ward.timeZone,
      createdAt: ward.createdAt,
      admins: ward.users,
    }));
  }

  async findActiveByName(name: string): Promise<Ward | null> {
    return this.prisma.client.ward.findFirst({
      where: { name, archivedAt: null },
    });
  }
}
