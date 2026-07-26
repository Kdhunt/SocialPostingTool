// Domain enums for Ward Communications Hub.
//
// These mirror the enum values defined in packages/database/prisma/schema.prisma
// (see docs/domain-model.md). They are duplicated here — not imported from
// @prisma/client — because this package must never depend on Prisma or any
// other framework/provider SDK (see AGENTS.md and .cursor/rules/architecture.mdc).
// Keep these two sources of truth in sync when either changes.

export const GENDERS = ['Male', 'Female', 'NotSpecified'] as const;
export type Gender = (typeof GENDERS)[number];

/**
 * Directed family relationship types. Intentionally broad and not tied to
 * one permanent family shape so divorce, remarriage, guardianship, and
 * non-nuclear households are representable.
 */
export const RELATIONSHIP_TYPES = [
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
] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

/** Administrative role within a household, separate from family relationship type. */
export const HOUSEHOLD_ROLES = ['Head', 'Member'] as const;
export type HouseholdRole = (typeof HOUSEHOLD_ROLES)[number];

export const CONTACT_METHOD_TYPES = ['Email', 'Phone'] as const;
export type ContactMethodType = (typeof CONTACT_METHOD_TYPES)[number];

/** Consent is never inferred; `Unknown` is the default until explicitly set. */
export const CONSENT_STATUSES = ['Unknown', 'Granted', 'Denied', 'Withdrawn'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const COMMUNICATION_CHANNELS = ['Email', 'Sms', 'FacebookPage'] as const;
export type CommunicationChannel = (typeof COMMUNICATION_CHANNELS)[number];

/**
 * Relationship types that are inherently symmetric between two people
 * (if A is the Spouse of B, B is also the Spouse of A). Asymmetric types
 * (Parent/Child, Husband/Wife, Guardian/Dependent) require a paired
 * inverse row instead — see `getInverseRelationshipType`.
 */
export const SYMMETRIC_RELATIONSHIP_TYPES: ReadonlySet<RelationshipType> = new Set([
  'Spouse',
  'Other',
  'NotSpecified',
]);

/**
 * Returns the natural inverse of a directed relationship type, or `null`
 * when a type has no single well-defined inverse (e.g. `Other`) and the
 * caller must choose one explicitly. Used when creating a relationship so
 * the reciprocal row can be created consistently.
 */
export function getInverseRelationshipType(type: RelationshipType): RelationshipType | null {
  switch (type) {
    case 'Husband':
      return 'Wife';
    case 'Wife':
      return 'Husband';
    case 'Son':
    case 'Daughter':
      return 'Parent';
    case 'Parent':
      return 'Child';
    case 'Child':
      return 'Parent';
    case 'Spouse':
      return 'Spouse';
    case 'Guardian':
      return 'Dependent';
    case 'Dependent':
      return 'Guardian';
    case 'Other':
    case 'NotSpecified':
      return null;
  }
}
