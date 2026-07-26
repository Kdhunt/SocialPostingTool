import { describe, expect, it } from 'vitest';
import { loadConfig, ConfigValidationError } from './load-config.js';

const validEnv = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/ward_comms_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'a'.repeat(32),
  REFRESH_TOKEN_SECRET: 'b'.repeat(32),
  WARD_CODE_PEPPER: 'c'.repeat(16),
};

describe('loadConfig', () => {
  it('parses a valid environment into a typed AppConfig', () => {
    const config = loadConfig(validEnv);

    expect(config.databaseUrl).toBe(validEnv.DATABASE_URL);
    expect(config.redisUrl).toBe(validEnv.REDIS_URL);
    expect(config.nodeEnv).toBe('test');
    expect(config.api.port).toBe(3001);
    expect(config.wardTimeZone).toBe('America/Denver');
  });

  it('splits and trims CORS_ALLOWED_ORIGINS into an array', () => {
    const config = loadConfig({
      ...validEnv,
      CORS_ALLOWED_ORIGINS: 'http://localhost:3000, http://localhost:3010',
    });

    expect(config.corsAllowedOrigins).toEqual(['http://localhost:3000', 'http://localhost:3010']);
  });

  it('throws a ConfigValidationError when required variables are missing', () => {
    expect(() => loadConfig({})).toThrow(ConfigValidationError);
  });

  it('throws a ConfigValidationError when secrets are too short', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SESSION_SECRET: 'too-short',
      }),
    ).toThrow(ConfigValidationError);
  });
});
