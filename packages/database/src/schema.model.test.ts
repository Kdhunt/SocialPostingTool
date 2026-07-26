// Schema "compile" test: verifies the generated Prisma Client's data model
// matches the entities and constraints required by
// phases/03-domain-model.md, without needing a live database connection.
// This runs in every environment (including sandboxes without Docker).
//
// See schema.integration.test.ts for the live-database variant of this
// coverage, which is skipped automatically when Postgres is unreachable.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

const models = Prisma.dmmf.datamodel.models;

function getModel(name: string): Prisma.DMMF.Model {
  const model = models.find((candidate) => candidate.name === name);
  if (!model) {
    throw new Error(`Expected model "${name}" to exist in the Prisma schema.`);
  }
  return model;
}

function getField(model: Prisma.DMMF.Model, fieldName: string): Prisma.DMMF.Field {
  const field = model.fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    throw new Error(`Expected field "${fieldName}" to exist on model "${model.name}".`);
  }
  return field;
}

describe('Prisma schema — Phase 3 entities exist', () => {
  it.each([
    'Ward',
    'ApplicationUser',
    'Role',
    'Permission',
    'UserRole',
    'UserSession',
    'WardCodeVersion',
    'Person',
    'Household',
    'HouseholdMembership',
    'PersonRelationship',
    'ContactMethod',
    'ContactConsent',
    'AudienceGroup',
    'AudienceGroupMember',
    'CommunicationDestination',
    'AudienceDestination',
    'AuditEvent',
  ])('defines model %s', (modelName) => {
    expect(() => getModel(modelName)).not.toThrow();
  });
});

describe('Prisma schema — soft archive / append-only invariants', () => {
  it.each(['Ward', 'ApplicationUser', 'Person', 'Household', 'PersonRelationship', 'ContactMethod', 'AudienceGroup', 'CommunicationDestination'])(
    '%s has a nullable archivedAt column instead of physical deletion',
    (modelName) => {
      const field = getField(getModel(modelName), 'archivedAt');
      expect(field.isRequired).toBe(false);
    },
  );

  it('AuditEvent has no archivedAt (append-only, never archived or deleted)', () => {
    const auditEvent = getModel('AuditEvent');
    expect(auditEvent.fields.some((field) => field.name === 'archivedAt')).toBe(false);
  });
});

describe('Prisma schema — separation of household membership and family relationship', () => {
  it('HouseholdMembership has its own householdRole distinct from PersonRelationship.relationshipType', () => {
    const membership = getModel('HouseholdMembership');
    const relationship = getModel('PersonRelationship');

    expect(getField(membership, 'householdRole').type).toBe('HouseholdRole');
    expect(getField(relationship, 'relationshipType').type).toBe('RelationshipType');
  });

  it('PersonRelationship is directed (personId and relatedPersonId are distinct fields)', () => {
    const relationship = getModel('PersonRelationship');
    expect(relationship.fields.some((field) => field.name === 'personId')).toBe(true);
    expect(relationship.fields.some((field) => field.name === 'relatedPersonId')).toBe(true);
  });
});

describe('Prisma schema — many to many relationships', () => {
  it('AudienceGroupMember joins Person and AudienceGroup', () => {
    const joinModel = getModel('AudienceGroupMember');
    expect(joinModel.fields.some((field) => field.name === 'personId')).toBe(true);
    expect(joinModel.fields.some((field) => field.name === 'audienceGroupId')).toBe(true);
  });

  it('AudienceDestination joins AudienceGroup and CommunicationDestination', () => {
    const joinModel = getModel('AudienceDestination');
    expect(joinModel.fields.some((field) => field.name === 'audienceGroupId')).toBe(true);
    expect(joinModel.fields.some((field) => field.name === 'destinationId')).toBe(true);
  });
});

describe('Prisma schema — consent is a distinct, explicit record', () => {
  it('ContactConsent defaults to Unknown, not an assumed granted state', () => {
    const consent = getModel('ContactConsent');
    const status = getField(consent, 'status');
    expect(status.hasDefaultValue).toBe(true);
    expect(status.default).toBe('Unknown');
  });
});

describe('Prisma schema — enums required by phases/03-domain-model.md', () => {
  const enums = Prisma.dmmf.datamodel.enums;

  function getEnumValues(name: string): string[] {
    const found = enums.find((candidate) => candidate.name === name);
    if (!found) {
      throw new Error(`Expected enum "${name}" to exist.`);
    }
    return found.values.map((value) => value.name);
  }

  it('Gender supports Male, Female, and NotSpecified', () => {
    expect(getEnumValues('Gender')).toEqual(['Male', 'Female', 'NotSpecified']);
  });

  it('RelationshipType supports the full required set without assuming one family shape', () => {
    expect(getEnumValues('RelationshipType')).toEqual([
      'Husband',
      'Wife',
      'Son',
      'Daughter',
      'Parent',
      'Child',
      'Spouse',
      'Guardian',
      'Dependent',
      'Other',
      'NotSpecified',
    ]);
  });
});
