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
    expect(config.facebook.appId).toBeUndefined();
    expect(config.facebook.appSecret).toBeUndefined();
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

  it('defaults system email to simulated without requiring provider secrets', () => {
    const config = loadConfig(validEnv);
    expect(config.systemEmail.mode).toBe('simulated');
    expect(config.systemEmail.fromAddress).toBe('noreply@localhost');
  });

  it('requires live system-email credentials when SYSTEM_EMAIL_MODE=live', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SYSTEM_EMAIL_MODE: 'live',
        SYSTEM_EMAIL_PROVIDER: 'sendgrid',
      }),
    ).toThrow(/SYSTEM_EMAIL_FROM/);

    const config = loadConfig({
      ...validEnv,
      SYSTEM_EMAIL_MODE: 'live',
      SYSTEM_EMAIL_PROVIDER: 'sendgrid',
      SYSTEM_EMAIL_FROM: 'noreply@example.test',
      SYSTEM_EMAIL_SENDGRID_API_KEY: 'sg-test-key',
    });
    expect(config.systemEmail.mode).toBe('live');
    expect(config.systemEmail.sendgridApiKey).toBe('sg-test-key');
  });

  it('requires a Resend API key when SYSTEM_EMAIL_PROVIDER=resend', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        SYSTEM_EMAIL_MODE: 'live',
        SYSTEM_EMAIL_PROVIDER: 'resend',
        SYSTEM_EMAIL_FROM: 'noreply@example.test',
      }),
    ).toThrow(/SYSTEM_EMAIL_RESEND_API_KEY/);

    const config = loadConfig({
      ...validEnv,
      SYSTEM_EMAIL_MODE: 'live',
      SYSTEM_EMAIL_PROVIDER: 'resend',
      SYSTEM_EMAIL_FROM: 'noreply@example.test',
      SYSTEM_EMAIL_RESEND_API_KEY: 're-test-key',
    });
    expect(config.systemEmail.provider).toBe('resend');
    expect(config.systemEmail.resendApiKey).toBe('re-test-key');
  });

  it('maps Vercel Resend marketplace env vars when live', () => {
    const config = loadConfig({
      ...validEnv,
      SYSTEM_EMAIL_MODE: 'live',
      wardcomms_RESEND_API_KEY: 're-marketplace-key',
      wardcomms_RESEND_EMAIL_DOMAIN: 'wardcomms.online',
    });
    expect(config.systemEmail.provider).toBe('resend');
    expect(config.systemEmail.resendApiKey).toBe('re-marketplace-key');
    expect(config.systemEmail.fromAddress).toBe('noreply@wardcomms.online');
  });

  it('loads optional Facebook app credentials together', () => {
    const config = loadConfig({
      ...validEnv,
      FACEBOOK_APP_ID: '1234567890',
      FACEBOOK_APP_SECRET: 'facebook-app-secret',
    });
    expect(config.facebook.appId).toBe('1234567890');
    expect(config.facebook.appSecret).toBe('facebook-app-secret');
  });

  it('rejects Facebook app id without secret', () => {
    expect(() =>
      loadConfig({
        ...validEnv,
        FACEBOOK_APP_ID: '1234567890',
      }),
    ).toThrow(/FACEBOOK_APP_ID and FACEBOOK_APP_SECRET must be set together/);
  });
});
