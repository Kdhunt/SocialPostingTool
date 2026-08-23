import { describe, expect, it } from 'vitest';
import { getInverseRelationshipType } from './enums.js';
import { assertNotSelfRelationship, buildRelationshipPair, SelfRelationshipError } from './relationship-rules.js';

describe('assertNotSelfRelationship', () => {
  it('throws when a person is related to themselves', () => {
    expect(() => assertNotSelfRelationship('person-1', 'person-1')).toThrow(SelfRelationshipError);
  });

  it('does not throw for distinct people', () => {
    expect(() => assertNotSelfRelationship('person-1', 'person-2')).not.toThrow();
  });
});

describe('getInverseRelationshipType', () => {
  it('maps asymmetric family types to their inverse', () => {
    expect(getInverseRelationshipType('Husband')).toBe('Wife');
    expect(getInverseRelationshipType('Wife')).toBe('Husband');
    expect(getInverseRelationshipType('Parent')).toBe('Child');
    expect(getInverseRelationshipType('Child')).toBe('Parent');
    expect(getInverseRelationshipType('Son')).toBe('Parent');
    expect(getInverseRelationshipType('Daughter')).toBe('Parent');
    expect(getInverseRelationshipType('Guardian')).toBe('Dependent');
    expect(getInverseRelationshipType('Dependent')).toBe('Guardian');
  });

  it('maps symmetric types to themselves', () => {
    expect(getInverseRelationshipType('Spouse')).toBe('Spouse');
  });

  it('returns null when there is no single well-defined inverse', () => {
    expect(getInverseRelationshipType('Other')).toBeNull();
    expect(getInverseRelationshipType('NotSpecified')).toBeNull();
  });
});

describe('buildRelationshipPair', () => {
  it('builds a forward + reciprocal pair for a two-way type', () => {
    const pair = buildRelationshipPair('husband-1', 'wife-1', 'Husband');

    expect(pair.personId).toBe('husband-1');
    expect(pair.relatedPersonId).toBe('wife-1');
    expect(pair.relationshipType).toBe('Husband');
    expect(pair.inverse).toEqual({
      personId: 'wife-1',
      relatedPersonId: 'husband-1',
      relationshipType: 'Wife',
    });
  });

  it('supports remarriage: a person can gain a new spouse relationship after an old one is archived', () => {
    const firstMarriage = buildRelationshipPair('person-1', 'ex-spouse-1', 'Spouse');
    const secondMarriage = buildRelationshipPair('person-1', 'new-spouse-1', 'Spouse');

    expect(firstMarriage.relatedPersonId).not.toBe(secondMarriage.relatedPersonId);
    expect(secondMarriage.inverse?.relationshipType).toBe('Spouse');
  });

  it('omits the reciprocal row when no inverse is defined and none is overridden', () => {
    const pair = buildRelationshipPair('person-1', 'person-2', 'Other');
    expect(pair.inverse).toBeNull();
  });

  it('respects an explicit inverse override', () => {
    const pair = buildRelationshipPair('person-1', 'person-2', 'Other', 'Dependent');
    expect(pair.inverse?.relationshipType).toBe('Dependent');
  });

  it('rejects a self relationship', () => {
    expect(() => buildRelationshipPair('person-1', 'person-1', 'Spouse')).toThrow(SelfRelationshipError);
  });
});
