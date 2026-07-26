import { describe, expect, it } from 'vitest';
import { requiresWardCodeVerification } from './ward-code-policy.js';

describe('requiresWardCodeVerification', () => {
  it('requires verification on a device that has never verified', () => {
    expect(
      requiresWardCodeVerification({
        lastVerifiedWardCodeVersionId: null,
        activeWardCodeVersionId: 'version-1',
      }),
    ).toBe(true);
  });

  it('does not require verification when the device already verified the active version', () => {
    expect(
      requiresWardCodeVerification({
        lastVerifiedWardCodeVersionId: 'version-1',
        activeWardCodeVersionId: 'version-1',
      }),
    ).toBe(false);
  });

  it('requires verification again after the ward code has been rotated', () => {
    expect(
      requiresWardCodeVerification({
        lastVerifiedWardCodeVersionId: 'version-1',
        activeWardCodeVersionId: 'version-2',
      }),
    ).toBe(true);
  });
});
