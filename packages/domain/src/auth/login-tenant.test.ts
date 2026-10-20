import { describe, expect, it } from 'vitest';
import { allowWardPathLogin, pickSolePlatformOperator, selectLoginTenant } from './login-tenant.js';

describe('selectLoginTenant', () => {
  it('treats a blank path as platform operator login', () => {
    expect(selectLoginTenant(undefined)).toEqual({ kind: 'platform' });
    expect(selectLoginTenant('  ')).toEqual({ kind: 'platform' });
  });

  it('normalizes a ward page path', () => {
    expect(selectLoginTenant(' GrangeCreek ')).toEqual({ kind: 'ward', slug: 'grangecreek' });
  });
});

describe('pickSolePlatformOperator', () => {
  it('returns the operator when they are the only PlatformAdmin and the username matches', () => {
    const operator = { id: 'op-1', username: 'platform.admin' };
    expect(pickSolePlatformOperator([operator], 'platform.admin')).toBe(operator);
  });

  it('rejects a second PlatformAdmin even when the username would match one of them', () => {
    expect(
      pickSolePlatformOperator(
        [
          { id: 'op-1', username: 'platform.admin' },
          { id: 'op-2', username: 'other.admin' },
        ],
        'platform.admin',
      ),
    ).toBeNull();
  });

  it('rejects a username that is not the sole PlatformAdmin', () => {
    expect(pickSolePlatformOperator([{ id: 'op-1', username: 'platform.admin' }], 'ward.clerk')).toBeNull();
    expect(pickSolePlatformOperator([], 'platform.admin')).toBeNull();
  });
});

describe('allowWardPathLogin', () => {
  it('allows ward-path sign-in for tenant accounts', () => {
    expect(allowWardPathLogin(false)).toBe(true);
  });

  it('rejects ward-path sign-in for the PlatformAdmin', () => {
    expect(allowWardPathLogin(true)).toBe(false);
  });
});
