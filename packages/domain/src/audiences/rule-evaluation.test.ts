import { describe, expect, it } from 'vitest';
import { findPeopleMatchingRules, personMatchesAudienceRules } from './rule-evaluation.js';

const asOf = new Date('2026-07-26');

describe('personMatchesAudienceRules', () => {
  const basePerson = {
    personId: 'p1',
    gender: 'Female' as const,
    dateOfBirth: new Date('2010-01-15'),
    householdRoles: ['Member' as const],
    archivedAt: null,
  };

  it('matches age range', () => {
    expect(personMatchesAudienceRules(basePerson, { ageMin: 10, ageMax: 20 }, asOf)).toBe(true);
    expect(personMatchesAudienceRules(basePerson, { ageMin: 18 }, asOf)).toBe(false);
  });

  it('matches gender filter', () => {
    expect(personMatchesAudienceRules(basePerson, { genders: ['Female'] }, asOf)).toBe(true);
    expect(personMatchesAudienceRules(basePerson, { genders: ['Male'] }, asOf)).toBe(false);
  });

  it('matches household role filter', () => {
    expect(personMatchesAudienceRules(basePerson, { householdRoles: ['Member'] }, asOf)).toBe(true);
    expect(personMatchesAudienceRules(basePerson, { householdRoles: ['Head'] }, asOf)).toBe(false);
  });

  it('excludes archived people', () => {
    expect(personMatchesAudienceRules({ ...basePerson, archivedAt: new Date() }, {}, asOf)).toBe(false);
  });
});

describe('findPeopleMatchingRules', () => {
  it('returns matching person ids', () => {
    const ids = findPeopleMatchingRules(
      [
        {
          personId: 'p1',
          gender: 'Male',
          dateOfBirth: new Date('1980-05-01'),
          householdRoles: ['Head'],
          archivedAt: null,
        },
        {
          personId: 'p2',
          gender: 'Female',
          dateOfBirth: new Date('2012-05-01'),
          householdRoles: ['Member'],
          archivedAt: null,
        },
      ],
      { ageMax: 17 },
      asOf,
    );
    expect(ids).toEqual(['p2']);
  });
});
