import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from './health.schema.js';

describe('healthResponseSchema', () => {
  it('accepts a valid health response', () => {
    const result = healthResponseSchema.safeParse({
      status: 'ok',
      service: '@ward-comms/api',
      timestamp: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
  });

  it('rejects an invalid status', () => {
    const result = healthResponseSchema.safeParse({
      status: 'unknown',
      service: '@ward-comms/api',
      timestamp: new Date().toISOString(),
    });

    expect(result.success).toBe(false);
  });
});
