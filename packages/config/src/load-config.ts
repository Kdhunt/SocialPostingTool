import { envSchema, normalizePlatformEnv, type Env } from './env.schema.js';

export interface AppConfig {
  nodeEnv: Env['NODE_ENV'];
  appName: string;
  wardTimeZone: string;
  api: {
    host: string;
    port: number;
    url: string;
  };
  web: {
    port: number;
    url: string;
  };
  worker: {
    healthPort: number;
    schedulePollIntervalMs: number;
  };
  databaseUrl: string;
  redisUrl: string;
  session: {
    secret: string;
    refreshTokenSecret: string;
  };
  wardCodePepper: string;
  providerCredentialsEncryptionKey: string;
  providerMode: 'simulated' | 'credentialed' | 'live';
  openAiApiKey: string | undefined;
  aiImageMode: 'simulated' | 'live';
  corsAllowedOrigins: string[];
  systemEmail: {
    mode: 'simulated' | 'live';
    provider: 'sendgrid' | 'smtp';
    fromAddress: string;
    sendgridApiKey: string | undefined;
    smtp:
      | {
          host: string;
          port: number;
          user: string;
          pass: string;
          secure: boolean;
        }
      | undefined;
  };
}

export class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}

function toAppConfig(env: Env): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    appName: env.APP_NAME,
    wardTimeZone: env.WARD_TIME_ZONE,
    api: {
      host: env.API_HOST,
      port: env.API_PORT,
      url: env.API_URL,
    },
    web: {
      port: env.WEB_PORT,
      url: env.WEB_URL,
    },
    worker: {
      healthPort: env.WORKER_HEALTH_PORT,
      schedulePollIntervalMs: env.SCHEDULE_POLL_INTERVAL_MS,
    },
    databaseUrl: env.DATABASE_URL,
    redisUrl: env.REDIS_URL,
    session: {
      secret: env.SESSION_SECRET,
      refreshTokenSecret: env.REFRESH_TOKEN_SECRET,
    },
    wardCodePepper: env.WARD_CODE_PEPPER,
    providerCredentialsEncryptionKey: env.PROVIDER_CREDENTIALS_ENCRYPTION_KEY,
    providerMode: env.PROVIDER_MODE,
    openAiApiKey: env.OPENAI_API_KEY,
    aiImageMode: env.AI_IMAGE_MODE,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    systemEmail: {
      mode: env.SYSTEM_EMAIL_MODE,
      provider: env.SYSTEM_EMAIL_PROVIDER,
      fromAddress: env.SYSTEM_EMAIL_FROM ?? 'noreply@localhost',
      sendgridApiKey: env.SYSTEM_EMAIL_SENDGRID_API_KEY,
      smtp:
        env.SYSTEM_EMAIL_SMTP_HOST && env.SYSTEM_EMAIL_SMTP_USER && env.SYSTEM_EMAIL_SMTP_PASS
          ? {
              host: env.SYSTEM_EMAIL_SMTP_HOST,
              port: env.SYSTEM_EMAIL_SMTP_PORT,
              user: env.SYSTEM_EMAIL_SMTP_USER,
              pass: env.SYSTEM_EMAIL_SMTP_PASS,
              secure: env.SYSTEM_EMAIL_SMTP_SECURE ?? false,
            }
          : undefined,
    },
  };
}

/**
 * Validates process.env (or a provided source) against the shared schema and
 * fails fast with a readable error instead of letting an app boot with
 * missing or invalid configuration.
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(normalizePlatformEnv(source));

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new ConfigValidationError(`Invalid environment configuration: ${issues}`);
  }

  const config = toAppConfig(result.data);
  if (config.systemEmail.mode === 'live') {
    if (!result.data.SYSTEM_EMAIL_FROM) {
      throw new ConfigValidationError(
        'Invalid environment configuration: SYSTEM_EMAIL_FROM is required when SYSTEM_EMAIL_MODE=live',
      );
    }
    if (config.systemEmail.provider === 'sendgrid' && !config.systemEmail.sendgridApiKey) {
      throw new ConfigValidationError(
        'Invalid environment configuration: SYSTEM_EMAIL_SENDGRID_API_KEY is required when SYSTEM_EMAIL_MODE=live and SYSTEM_EMAIL_PROVIDER=sendgrid',
      );
    }
    if (config.systemEmail.provider === 'smtp' && !config.systemEmail.smtp) {
      throw new ConfigValidationError(
        'Invalid environment configuration: SYSTEM_EMAIL_SMTP_HOST, SYSTEM_EMAIL_SMTP_USER, and SYSTEM_EMAIL_SMTP_PASS are required when SYSTEM_EMAIL_MODE=live and SYSTEM_EMAIL_PROVIDER=smtp',
      );
    }
  }

  return config;
}
