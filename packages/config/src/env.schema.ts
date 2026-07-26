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
   * 32-byte key material as base64 (or a long passphrase hashed at load time).
   * Used only to encrypt/decrypt ProviderCredential rows — never logged.
   */
  PROVIDER_CREDENTIALS_ENCRYPTION_KEY: z
    .string()
    .min(32, 'PROVIDER_CREDENTIALS_ENCRYPTION_KEY must be at least 32 characters')
    .default('dev-only-provider-credentials-key!!'),

  /** `simulated` = Phase 8 adapters; `credentialed` = require encrypted credentials then simulate/send. */
  PROVIDER_MODE: z.enum(['simulated', 'credentialed']).default('simulated'),

  CORS_ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
});

export type Env = z.infer<typeof envSchema>;
