import { PrismaClient } from '@prisma/client';

declare global {
  var __wardCommsPrisma: PrismaClient | undefined;
}

/**
 * Reuses a single PrismaClient instance across hot reloads / module reloads
 * in development so we do not exhaust the PostgreSQL connection pool.
 */
export function createPrismaClient(): PrismaClient {
  if (globalThis.__wardCommsPrisma) {
    return globalThis.__wardCommsPrisma;
  }

  const client = new PrismaClient();

  if (process.env.NODE_ENV !== 'production') {
    globalThis.__wardCommsPrisma = client;
  }

  return client;
}

export type { PrismaClient } from '@prisma/client';
