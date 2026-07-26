import { getInverseRelationshipType, type RelationshipType } from './enums.js';

export class SelfRelationshipError extends Error {
  constructor() {
    super('A person cannot have a relationship with themselves.');
    this.name = 'SelfRelationshipError';
  }
}

/**
 * A relationship row plus its reciprocal, ready for the application layer
 * to persist atomically (in the same transaction) so the two directions of
 * a family relationship never fall out of sync.
 */
export interface RelationshipPair {
  personId: string;
  relatedPersonId: string;
  relationshipType: RelationshipType;
  inverse: {
    personId: string;
    relatedPersonId: string;
    relationshipType: RelationshipType;
  } | null;
}

/**
 * Validates that a relationship is not reflexive. The Prisma schema cannot
 * express `personId != relatedPersonId` as a CHECK constraint in this
 * Prisma version (see schema.prisma comment on PersonRelationship), so the
 * application layer must call this before every create/update.
 */
export function assertNotSelfRelationship(personId: string, relatedPersonId: string): void {
  if (personId === relatedPersonId) {
    throw new SelfRelationshipError();
  }
}

/**
 * Builds the pair of directed rows (forward + reciprocal) needed to record
 * a family relationship consistently. When the relationship type has no
 * single well-defined inverse (e.g. `Other`), the caller-supplied
 * `inverseRelationshipType` is used, or no reciprocal row is created if
 * omitted.
 */
export function buildRelationshipPair(
  personId: string,
  relatedPersonId: string,
  relationshipType: RelationshipType,
  inverseRelationshipTypeOverride?: RelationshipType,
): RelationshipPair {
  assertNotSelfRelationship(personId, relatedPersonId);

  const inverseType = inverseRelationshipTypeOverride ?? getInverseRelationshipType(relationshipType);

  return {
    personId,
    relatedPersonId,
    relationshipType,
    inverse: inverseType
      ? {
          personId: relatedPersonId,
          relatedPersonId: personId,
          relationshipType: inverseType,
        }
      : null,
  };
}
