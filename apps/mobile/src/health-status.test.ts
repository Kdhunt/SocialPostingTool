import { describe, expect, it } from 'vitest';
import { toStatusBadgeLabel, toStatusBadgeTone } from './health-status.js';

describe('health status helpers', () => {
  it('maps loading state to a neutral tone', () => {
    expect(toStatusBadgeTone({ kind: 'loading' })).toBe('neutral');
  });

  it('maps success state to a success tone and includes the service name', () => {
    const state = { kind: 'success' as const, service: '@ward-comms/api', timestamp: 'now' };

    expect(toStatusBadgeTone(state)).toBe('success');
    expect(toStatusBadgeLabel(state)).toContain('@ward-comms/api');
  });

  it('maps error state to an error tone', () => {
    const state = { kind: 'error' as const, message: 'network down' };

    expect(toStatusBadgeTone(state)).toBe('error');
    expect(toStatusBadgeLabel(state)).toContain('network down');
  });
});
