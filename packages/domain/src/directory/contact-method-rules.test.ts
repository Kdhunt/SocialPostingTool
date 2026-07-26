import { describe, expect, it } from 'vitest';
import { hasAnyContactMethod, resolvePrimaryDemotions } from './contact-method-rules.js';

describe('resolvePrimaryDemotions', () => {
  it('demotes another primary method of the same type', () => {
    const methods = [
      { id: 'a', type: 'Email' as const, isPrimary: true },
      { id: 'b', type: 'Email' as const, isPrimary: false },
    ];
    expect(resolvePrimaryDemotions(methods, 'b')).toEqual(['a']);
  });

  it('does not demote methods of a different type', () => {
    const methods = [
      { id: 'a', type: 'Phone' as const, isPrimary: true },
      { id: 'b', type: 'Email' as const, isPrimary: false },
    ];
    expect(resolvePrimaryDemotions(methods, 'b')).toEqual([]);
  });

  it('returns an empty list when the target id does not exist', () => {
    const methods = [{ id: 'a', type: 'Email' as const, isPrimary: true }];
    expect(resolvePrimaryDemotions(methods, 'missing')).toEqual([]);
  });

  it('does not demote already-non-primary methods (nothing to demote)', () => {
    const methods = [
      { id: 'a', type: 'Email' as const, isPrimary: false },
      { id: 'b', type: 'Email' as const, isPrimary: false },
    ];
    expect(resolvePrimaryDemotions(methods, 'b')).toEqual([]);
  });
});

describe('hasAnyContactMethod', () => {
  it('is false for a person with no contact methods (incomplete record)', () => {
    expect(hasAnyContactMethod([])).toBe(false);
  });

  it('is false when every contact method is archived', () => {
    expect(hasAnyContactMethod([{ archivedAt: new Date() }])).toBe(false);
  });

  it('is true when at least one contact method is active', () => {
    expect(hasAnyContactMethod([{ archivedAt: new Date() }, { archivedAt: null }])).toBe(true);
  });
});
