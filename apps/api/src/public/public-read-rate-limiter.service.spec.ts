import { describe, expect, it } from 'vitest';
import { PublicReadRateLimiterService } from './public-read-rate-limiter.service.js';

describe('PublicReadRateLimiterService', () => {
  it('gives bulletin reads a separate, much larger budget than the campaign board', () => {
    const limiter = new PublicReadRateLimiterService();
    for (let i = 0; i < 120; i += 1) expect(limiter.consume('203.0.113.9:board')).toBe(true);
    expect(limiter.consume('203.0.113.9:board')).toBe(false);

    for (let i = 0; i < 2_000; i += 1)
      expect(limiter.consumeBulletinRead('203.0.113.9:read')).toBe(true);
    expect(limiter.consumeBulletinRead('203.0.113.9:read')).toBe(false);
  });
});
