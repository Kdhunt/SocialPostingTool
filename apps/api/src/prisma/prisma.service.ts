import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createPrismaClient, type PrismaClient } from '@ward-comms/database';

/**
 * Thin NestJS lifecycle wrapper around the shared Prisma client factory.
 * Business logic must never live here — see architecture.mdc ("controllers
 * thin", "domain rules in packages/domain and app services").
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client: PrismaClient = createPrismaClient();

  async onModuleInit(): Promise<void> {
    await this.client.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
