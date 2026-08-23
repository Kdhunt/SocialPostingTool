import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('Ward Communications Hub'),
  WARD_TIME_ZONE: z.string().default('America/Denver'),

  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  API_URL: z.string().url().default('http://localhost:3001'),

  WEB_PORT: z.coerce.number().int().positive().default(3000),
  WEB_URL: z.string().url().default('http://localhost:3000'),

  WORKER_HEALTH_PORT: z.coerce.number().int().positive().default(3002),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
  REFRESH_TOKEN_SECRET: z.string().min(32, 'REFRESH_TOKEN_SECRET must be at least 32 characters'),
  WARD_CODE_PEPPER: z.string().min(16, 'WARD_CODE_PEPPER must be at least 16 characters'),

  /**
   * Vercel Cron sends Authorization: Bearer ${CRON_SECRET}. Required in production
   * when cron routes are enabled (see docs/vercel.md).
   */
  CRON_SECRET: z.string().min(16).optional(),

  /**
   * 32-byte key material as base64 (or a long passphrase hashed at load time).
   * Used only to encrypt/decrypt ProviderCredential rows — never logged.
   */
  PROVIDER_CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(32, 'PROVIDER_CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters')
    .default('dev-only-provider-credentials-key!!'),

  /** `simulated` | `credentialed` | `live` — see docs/providers.md */
  PROVIDER_MODE: z.enum(['simulated', 'credentialed', 'live']).default('simulated'),

  /** Optional OpenAI key for live AI image generation. When absent, AI_IMAGE_MODE falls back to simulated. */
  OPENAI_API_KEY: z.string().optional(),

  /** `simulated` = deterministic placeholder URLs; `live` = OpenAI images API when OPENAI_API_KEY is set. */
  AI_IMAGE_MODE: z.enum(['simulated', 'live']).default('simulated'),

  /** Worker schedule poller interval in milliseconds. */
  SCHEDULE_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Maps Vercel Storage / Marketplace integration env vars onto the canonical
 * names used throughout the monorepo (see docs/vercel.md).
 */
export function normalizePlatformEnv(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const normalized: Record<string, string | undefined> = { ...source };

  normalized.DATABASE_URL =
    source.DATABASE_URL ??
    source.PRISMA_DATABASE_URL ??
    source.POSTGRES_PRISMA_URL ??
    source.POSTGRES_URL ??
    undefined;

  normalized.REDIS_URL =
    source.REDIS_URL ?? source.UPSTASH_REDIS_URL ?? source.KV_REDIS_URL ?? undefined;

  if (!normalized.API_URL && source.VERCEL_URL) {
    normalized.API_URL = `https://${source.VERCEL_URL}`;
  }

  if (!normalized.WEB_URL && source.VERCEL_URL) {
    normalized.WEB_URL = `https://${source.VERCEL_URL}`;
  }

  if (!normalized.NODE_ENV && source.VERCEL) {
    normalized.NODE_ENV = 'production';
  }

  return normalized;
}

/**
 * Direct Postgres URL for `prisma migrate deploy` during Vercel builds.
 * Prefer the non-pooled URL when Vercel Postgres provides one.
 */
export function getMigrationDatabaseUrl(
  source: Record<string, string | undefined>,
): string | undefined {
  const normalized = normalizePlatformEnv(source);
  return (
    source.POSTGRES_URL_NON_POOLING ??
    source.POSTGRES_URL ??
    normalized.DATABASE_URL ??
    undefined
  );
}

/** Runtime / seed URL — pooled Prisma URL when available. */
export function getSeedDatabaseUrl(source: Record<string, string | undefined>): string | undefined {
  const normalized = normalizePlatformEnv(source);
  return (
    normalized.DATABASE_URL ??
    source.PRISMA_DATABASE_URL ??
    source.POSTGRES_PRISMA_URL ??
    source.POSTGRES_URL ??
    undefined
  );
}
