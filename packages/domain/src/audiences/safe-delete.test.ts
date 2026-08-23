import { describe, expect, it } from 'vitest';
import { checkAudienceSafeToDelete } from './safe-delete.js';

describe('checkAudienceSafeToDelete', () => {
  it('is safe when there are no members and no destinations', () => {
    expect(checkAudienceSafeToDelete({ memberCount: 0, destinationCount: 0 })).toEqual({ safe: true });
  });

  it('is unsafe when there are members', () => {
    const result = checkAudienceSafeToDelete({ memberCount: 3, destinationCount: 0 });
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/members/);
  });

  it('is unsafe when there are destination links, even with no members', () => {
    const result = checkAudienceSafeToDelete({ memberCount: 0, destinationCount: 1 });
    expect(result.safe).toBe(false);
    expect(result.reason).toMatch(/destination/);
  });
});
