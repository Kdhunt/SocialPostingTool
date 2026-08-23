import { Inject, Injectable } from '@nestjs/common';
import type { Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class RoleRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listAll(): Promise<Role[]> {
    return this.prisma.client.role.findMany({ orderBy: { name: 'asc' } });
  }

  async findByIds(ids: string[]): Promise<Role[]> {
    if (ids.length === 0) return [];
    return this.prisma.client.role.findMany({ where: { id: { in: ids } } });
  }

  async findByName(name: string): Promise<Role | null> {
    return this.prisma.client.role.findUnique({ where: { name } });
  }
}
