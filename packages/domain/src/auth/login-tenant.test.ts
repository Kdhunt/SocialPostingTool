import { describe, expect, it } from 'vitest';
import { selectLoginTenant } from './login-tenant.js';

describe('selectLoginTenant', () => {
  it('treats a blank path as platform operator login', () => {
    expect(selectLoginTenant(undefined)).toEqual({ kind: 'platform' });
    expect(selectLoginTenant('  ')).toEqual({ kind: 'platform' });
  });

  it('normalizes a ward page path', () => {
    expect(selectLoginTenant(' GrangeCreek ')).toEqual({ kind: 'ward', slug: 'grangecreek' });
  });
});
