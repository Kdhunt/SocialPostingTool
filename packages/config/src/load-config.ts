import { envSchema, type Env } from './env.schema.js';

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
  };
  databaseUrl: string;
  redisUrl: string;
  session: {
    secret: string;
    refreshTokenSecret: string;
  };
  wardCodePepper: string;
  providerCredentialsEncryptionKey: string;
  providerMode: 'simulated' | 'credentialed';
  corsAllowedOrigins: string[];
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
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  };
}

/**
 * Validates process.env (or a provided source) against the shared schema and
 * fails fast with a readable error instead of letting an app boot with
 * missing or invalid configuration.
 */
export function loadConfig(source: Record<string, string | undefined> = process.env): AppConfig {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new ConfigValidationError(`Invalid environment configuration: ${issues}`);
  }

  return toAppConfig(result.data);
}
