import { describe, expect, it } from 'vitest';
import {
  getMigrationDatabaseUrl,
  getSeedDatabaseUrl,
  normalizePlatformEnv,
} from './env.schema.js';

describe('getMigrationDatabaseUrl', () => {
  it('prefers the non-pooled Vercel Postgres URL for migrations', () => {
    expect(
      getMigrationDatabaseUrl({
        POSTGRES_URL_NON_POOLING: 'postgresql://direct',
        POSTGRES_URL: 'postgresql://pooled-direct',
        POSTGRES_PRISMA_URL: 'postgresql://prisma-pooled',
      }),
    ).toBe('postgresql://direct');
  });

  it('falls back to POSTGRES_URL then pooled DATABASE_URL', () => {
    expect(
      getMigrationDatabaseUrl({
        POSTGRES_URL: 'postgresql://pooled-direct',
        POSTGRES_PRISMA_URL: 'postgresql://prisma-pooled',
      }),
    ).toBe('postgresql://pooled-direct');

    expect(
      getMigrationDatabaseUrl({
        POSTGRES_PRISMA_URL: 'postgresql://prisma-pooled',
      }),
    ).toBe('postgresql://prisma-pooled');
  });
});

describe('getSeedDatabaseUrl', () => {
  it('prefers the pooled Prisma URL for seeding', () => {
    expect(
      getSeedDatabaseUrl({
        POSTGRES_URL_NON_POOLING: 'postgresql://direct',
        POSTGRES_PRISMA_URL: 'postgresql://prisma-pooled',
      }),
    ).toBe('postgresql://prisma-pooled');
  });
});

describe('normalizePlatformEnv', () => {
  it('maps Vercel Postgres and Redis integration variables', () => {
    const normalized = normalizePlatformEnv({
      POSTGRES_PRISMA_URL: 'postgresql://db',
      UPSTASH_REDIS_URL: 'rediss://redis',
      VERCEL_URL: 'my-app.vercel.app',
      VERCEL: '1',
    });

    expect(normalized.DATABASE_URL).toBe('postgresql://db');
    expect(normalized.REDIS_URL).toBe('rediss://redis');
    expect(normalized.API_URL).toBe('https://my-app.vercel.app');
    expect(normalized.WEB_URL).toBe('https://my-app.vercel.app');
    expect(normalized.NODE_ENV).toBe('production');
  });

  it('maps Vercel Prisma Postgres integration variables', () => {
    const normalized = normalizePlatformEnv({
      PRISMA_DATABASE_URL: 'postgresql://prisma-pooled',
      POSTGRES_URL: 'postgresql://direct',
    });

    expect(normalized.DATABASE_URL).toBe('postgresql://prisma-pooled');
    expect(getMigrationDatabaseUrl({ PRISMA_DATABASE_URL: 'postgresql://prisma-pooled', POSTGRES_URL: 'postgresql://direct' })).toBe(
      'postgresql://direct',
    );
    expect(getSeedDatabaseUrl({ PRISMA_DATABASE_URL: 'postgresql://prisma-pooled', POSTGRES_URL: 'postgresql://direct' })).toBe(
      'postgresql://prisma-pooled',
    );
  });
});
