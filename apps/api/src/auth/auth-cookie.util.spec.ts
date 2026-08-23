import { describe, expect, it } from 'vitest';
import { getAuthCookieOptions } from './auth-cookie.util.js';

const baseEnv = {
  DATABASE_URL: 'postgresql://u:p@localhost/db',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_SECRET: 'x'.repeat(32),
  REFRESH_TOKEN_SECRET: 'y'.repeat(32),
  WARD_CODE_PEPPER: 'pepper-value-here',
};

describe('getAuthCookieOptions', () => {
  it('uses SameSite=None for cross-origin production deployments', () => {
    const options = getAuthCookieOptions(
      { maxAge: 1000 },
      {
        ...baseEnv,
        NODE_ENV: 'production',
        WEB_URL: 'https://app.example.com',
        API_URL: 'https://api.example.com',
      },
    );

    expect(options.sameSite).toBe('none');
    expect(options.secure).toBe(true);
    expect(options.httpOnly).toBe(true);
  });

  it('uses SameSite=Lax for same-origin production deployments', () => {
    const options = getAuthCookieOptions(undefined, {
      ...baseEnv,
      NODE_ENV: 'production',
      WEB_URL: 'https://example.com',
      API_URL: 'https://example.com',
    });

    expect(options.sameSite).toBe('lax');
    expect(options.secure).toBe(true);
  });
});
