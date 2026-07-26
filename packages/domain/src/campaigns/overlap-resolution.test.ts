import { describe, expect, it } from 'vitest';
import { buildOverlapConflicts, resolveOverlapForPerson } from './overlap-resolution.js';

describe('resolveOverlapForPerson', () => {
  const order = ['aud-a', 'aud-b', 'aud-c'];

  it('returns the single audience for non-overlapping people', () => {
    expect(
      resolveOverlapForPerson({
        audienceGroupIdsInOrder: order,
        personAudienceGroupIds: ['aud-b'],
        strategy: 'FirstAudienceWins',
      }),
    ).toEqual({ winningAudienceGroupId: 'aud-b', usesBaseContent: false });
  });

  it('FirstAudienceWins picks the first audience in campaign order', () => {
    expect(
      resolveOverlapForPerson({
        audienceGroupIdsInOrder: order,
        personAudienceGroupIds: ['aud-c', 'aud-a'],
        strategy: 'FirstAudienceWins',
      }),
    ).toEqual({ winningAudienceGroupId: 'aud-a', usesBaseContent: false });
  });

  it('PreferBase uses base content for overlaps', () => {
    expect(
      resolveOverlapForPerson({
        audienceGroupIdsInOrder: order,
        personAudienceGroupIds: ['aud-b', 'aud-c'],
        strategy: 'PreferBase',
      }),
    ).toEqual({ winningAudienceGroupId: null, usesBaseContent: true });
  });

  it('PreferSpecificAudience prefers the configured audience when present', () => {
    expect(
      resolveOverlapForPerson({
        audienceGroupIdsInOrder: order,
        personAudienceGroupIds: ['aud-a', 'aud-c'],
        strategy: 'PreferSpecificAudience',
        preferSpecificAudienceGroupId: 'aud-c',
      }),
    ).toEqual({ winningAudienceGroupId: 'aud-c', usesBaseContent: false });
  });

  it('PreferSpecificAudience falls back to first-in-order when preferred audience absent', () => {
    expect(
      resolveOverlapForPerson({
        audienceGroupIdsInOrder: order,
        personAudienceGroupIds: ['aud-a', 'aud-b'],
        strategy: 'PreferSpecificAudience',
        preferSpecificAudienceGroupId: 'aud-c',
      }),
    ).toEqual({ winningAudienceGroupId: 'aud-a', usesBaseContent: false });
  });
});

describe('buildOverlapConflicts', () => {
  it('returns conflicts only for people in multiple audiences', () => {
    const conflicts = buildOverlapConflicts(
      [
        { personId: 'p1', audienceGroupIds: ['a', 'b'] },
        { personId: 'p2', audienceGroupIds: ['a'] },
      ],
      ['a', 'b'],
      'FirstAudienceWins',
    );
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]?.personId).toBe('p1');
    expect(conflicts[0]?.winningAudienceGroupId).toBe('a');
  });
});
