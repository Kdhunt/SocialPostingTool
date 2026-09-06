import { afterEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest } from '@vercel/node';
import { assertCronAuthorized } from './cron-auth.js';

function requestWithAuthorization(authorization?: string): VercelRequest {
  return { headers: { authorization } } as VercelRequest;
}

describe('assertCronAuthorized', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts a Bearer token when CRON_SECRET has surrounding whitespace', () => {
    vi.stubEnv('CRON_SECRET', '  cron-secret-value  \n');
    expect(() => assertCronAuthorized(requestWithAuthorization('Bearer cron-secret-value'))).not.toThrow();
  });

  it('rejects a missing secret', () => {
    vi.stubEnv('CRON_SECRET', '   ');
    expect(() => assertCronAuthorized(requestWithAuthorization('Bearer cron-secret-value'))).toThrow(
      /CRON_SECRET is not configured/,
    );
  });
});
