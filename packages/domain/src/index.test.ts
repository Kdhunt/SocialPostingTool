import { describe, expect, it } from 'vitest';
import { describeDomainPackage, DOMAIN_PACKAGE_NAME } from './index.js';

describe('domain package scaffold', () => {
  it('exposes a package name constant', () => {
    expect(DOMAIN_PACKAGE_NAME).toBe('@ward-comms/domain');
  });

  it('describes itself', () => {
    expect(describeDomainPackage()).toContain('domain rules');
  });
});
