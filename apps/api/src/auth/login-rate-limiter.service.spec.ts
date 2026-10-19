import { describe, expect, it } from 'vitest';
import { LoginRateLimiterService } from './login-rate-limiter.service.js';

describe('LoginRateLimiterService', () => {
  it('allows attempts under the limit', () => {
    const limiter = new LoginRateLimiterService();
    for (let i = 0; i < 10; i += 1) {
      expect(limiter.consume('ip:user')).toBe(true);
    }
  });

  it('blocks attempts once the limit is exceeded within the window', () => {
    const limiter = new LoginRateLimiterService();
    for (let i = 0; i < 10; i += 1) {
      limiter.consume('ip:user');
    }
    expect(limiter.consume('ip:user')).toBe(false);
  });

  it('tracks separate keys independently', () => {
    const limiter = new LoginRateLimiterService();
    for (let i = 0; i < 10; i += 1) {
      limiter.consume('ip:user-a');
    }
    expect(limiter.consume('ip:user-a')).toBe(false);
    expect(limiter.consume('ip:user-b')).toBe(true);
  });

  it('resets a key so it can be consumed again immediately', () => {
    const limiter = new LoginRateLimiterService();
    for (let i = 0; i < 10; i += 1) {
      limiter.consume('ip:user');
    }
    limiter.reset('ip:user');
    expect(limiter.consume('ip:user')).toBe(true);
  });

  it('allows attempts again once the window has elapsed', () => {
    const limiter = new LoginRateLimiterService();
    const start = new Date('2026-01-01T00:00:00Z');
    for (let i = 0; i < 10; i += 1) {
      limiter.consume('ip:user', start);
    }
    expect(limiter.consume('ip:user', start)).toBe(false);

    const later = new Date(start.getTime() + 20 * 60_000);
    expect(limiter.consume('ip:user', later)).toBe(true);
  });

  it('gives a bare address a larger budget than an address+username pair', () => {
    const limiter = new LoginRateLimiterService();
    for (let i = 0; i < 10; i += 1) expect(limiter.consume('203.0.113.5:unit:alice')).toBe(true);
    expect(limiter.consume('203.0.113.5:unit:alice')).toBe(false);

    for (let i = 0; i < 60; i += 1) expect(limiter.consumeAddress('203.0.113.5:login')).toBe(true);
    expect(limiter.consumeAddress('203.0.113.5:login')).toBe(false);
  });
});
