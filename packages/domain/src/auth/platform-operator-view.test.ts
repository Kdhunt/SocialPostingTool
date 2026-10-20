import { describe, expect, it } from 'vitest';
import { isPlatformOperatorView } from './platform-operator-view.js';

describe('isPlatformOperatorView', () => {
  it('is true for a PlatformAdmin with only platform permissions', () => {
    expect(isPlatformOperatorView(['platform.wards.manage'])).toBe(true);
  });

  it('is false when the operator also has ward-work permissions', () => {
    expect(isPlatformOperatorView(['platform.wards.manage', 'directory.read', 'users.manage'])).toBe(
      false,
    );
  });

  it('is false for a ward administrator', () => {
    expect(isPlatformOperatorView(['users.manage', 'directory.read'])).toBe(false);
  });
});
