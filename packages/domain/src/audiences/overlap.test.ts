import { describe, expect, it } from 'vitest';
import { findOverlappingPeople, isDuplicateMembership, mergeAudienceMemberships } from './overlap.js';

describe('mergeAudienceMemberships', () => {
  it('deduplicates a person appearing in multiple audiences and records every audience id', () => {
    const result = mergeAudienceMemberships([
      { audienceGroupId: 'a1', personIds: ['p1', 'p2'] },
      { audienceGroupId: 'a2', personIds: ['p2', 'p3'] },
    ]);

    const p2 = result.find((person) => person.personId === 'p2');
    expect(p2?.audienceGroupIds.sort()).toEqual(['a1', 'a2']);
    expect(result).toHaveLength(3);
  });

  it('returns an empty list for no audiences', () => {
    expect(mergeAudienceMemberships([])).toEqual([]);
  });
});

describe('findOverlappingPeople', () => {
  it('only returns people present in more than one audience', () => {
    const result = findOverlappingPeople([
      { audienceGroupId: 'a1', personIds: ['p1', 'p2'] },
      { audienceGroupId: 'a2', personIds: ['p2', 'p3'] },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]?.personId).toBe('p2');
  });

  it('returns an empty list when there is no overlap', () => {
    const result = findOverlappingPeople([
      { audienceGroupId: 'a1', personIds: ['p1'] },
      { audienceGroupId: 'a2', personIds: ['p2'] },
    ]);
    expect(result).toEqual([]);
  });
});

describe('isDuplicateMembership', () => {
  it('detects an already-present person', () => {
    expect(isDuplicateMembership(['p1', 'p2'], 'p2')).toBe(true);
  });

  it('returns false for a person not yet a member', () => {
    expect(isDuplicateMembership(['p1', 'p2'], 'p3')).toBe(false);
  });
});
