import { describe, expect, it } from 'vitest';
import { isSessionExpired, isSessionRevoked, isSessionValid } from './session-policy.js';

describe('isSessionExpired', () => {
  it('is true once expiresAt has passed', () => {
    expect(isSessionExpired(new Date('2026-01-01T00:00:00Z'), new Date('2026-01-01T00:00:01Z'))).toBe(true);
  });

  it('is false while expiresAt is in the future', () => {
    expect(isSessionExpired(new Date('2026-01-01T01:00:00Z'), new Date('2026-01-01T00:00:00Z'))).toBe(false);
  });
});

describe('isSessionRevoked', () => {
  it('is false when revokedAt is null', () => {
    expect(isSessionRevoked(null)).toBe(false);
  });

  it('is true when revokedAt is set', () => {
    expect(isSessionRevoked(new Date())).toBe(true);
  });
});

describe('isSessionValid', () => {
  const now = new Date('2026-01-01T00:00:00Z');

  it('is valid when not expired and not revoked', () => {
    expect(isSessionValid({ expiresAt: new Date('2026-01-02T00:00:00Z'), revokedAt: null }, now)).toBe(true);
  });

  it('is invalid when revoked even if not expired', () => {
    expect(
      isSessionValid({ expiresAt: new Date('2026-01-02T00:00:00Z'), revokedAt: new Date('2025-12-31T00:00:00Z') }, now),
    ).toBe(false);
  });

  it('is invalid when expired even if not revoked', () => {
    expect(isSessionValid({ expiresAt: new Date('2025-12-31T00:00:00Z'), revokedAt: null }, now)).toBe(false);
  });
});
