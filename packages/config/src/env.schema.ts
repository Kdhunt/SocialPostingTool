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

  /**
   * Platform transactional email (account verification, password reset).
   * Independent of per-ward campaign `PROVIDER_MODE` so new wards can
   * receive setup mail before they configure SendGrid/Twilio credentials.
   */
  SYSTEM_EMAIL_MODE: z.enum(['simulated', 'live']).default('simulated'),
  SYSTEM_EMAIL_PROVIDER: z.enum(['sendgrid', 'resend', 'smtp']).default('sendgrid'),
  SYSTEM_EMAIL_FROM: z.string().email().optional(),
  SYSTEM_EMAIL_SENDGRID_API_KEY: z.string().optional(),
  SYSTEM_EMAIL_RESEND_API_KEY: z.string().optional(),
  SYSTEM_EMAIL_SMTP_HOST: z.string().optional(),
  SYSTEM_EMAIL_SMTP_PORT: z.coerce.number().int().positive().default(587),
  SYSTEM_EMAIL_SMTP_USER: z.string().optional(),
  SYSTEM_EMAIL_SMTP_PASS: z.string().optional(),
  SYSTEM_EMAIL_SMTP_SECURE: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
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

  const vercelPublicOrigin = vercelCanonicalOrigin(source);
  if (!normalized.API_URL && vercelPublicOrigin) {
    normalized.API_URL = vercelPublicOrigin;
  }

  if (!normalized.WEB_URL && vercelPublicOrigin) {
    normalized.WEB_URL = vercelPublicOrigin;
  }

  if (!normalized.NODE_ENV && source.VERCEL) {
    normalized.NODE_ENV = 'production';
  }

  const resendApiKey =
    source.SYSTEM_EMAIL_RESEND_API_KEY ?? source.RESEND_API_KEY ?? source.wardcomms_RESEND_API_KEY;
  if (resendApiKey) {
    normalized.SYSTEM_EMAIL_RESEND_API_KEY = resendApiKey;
  }

  const resendDomain = source.SYSTEM_EMAIL_RESEND_DOMAIN ?? source.wardcomms_RESEND_EMAIL_DOMAIN;
  if (!normalized.SYSTEM_EMAIL_FROM && resendDomain) {
    normalized.SYSTEM_EMAIL_FROM = `noreply@${resendDomain.replace(/^@/, '')}`;
  }

  if (!source.SYSTEM_EMAIL_PROVIDER && resendApiKey) {
    normalized.SYSTEM_EMAIL_PROVIDER = 'resend';
  }

  return normalized;
}

function httpsOriginFromVercelHost(value: string): string {
  return `https://${value.trim().replace(/^https?:\/\//, '')}`;
}

/**
 * Production account-email links must use the custom domain, not the
 * per-deployment `*.vercel.app` host from `VERCEL_URL`.
 */
function vercelCanonicalOrigin(source: Record<string, string | undefined>): string | undefined {
  if (source.VERCEL_ENV === 'production' && source.VERCEL_PROJECT_PRODUCTION_URL) {
    return httpsOriginFromVercelHost(source.VERCEL_PROJECT_PRODUCTION_URL);
  }
  if (source.VERCEL_URL) {
    return httpsOriginFromVercelHost(source.VERCEL_URL);
  }
  return undefined;
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
