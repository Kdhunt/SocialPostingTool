import { z } from 'zod';

// Request/response contracts for the Phase 5 directory (people, households,
// relationships, contact methods, consent). Date of birth and contact
// methods are nullable/omittable on read responses because minor data
// restrictions (AGENTS.md #14) mean the API may withhold them depending on
// the requesting user's permissions — the shared shape must represent
// "not returned" rather than force every caller to always receive them.

export const genderSchema = z.enum(['Male', 'Female', 'NotSpecified']);
export const relationshipTypeSchema = z.enum([
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
export const householdRoleSchema = z.enum(['Head', 'Member']);
export const contactMethodTypeSchema = z.enum(['Email', 'Phone']);
export const consentStatusSchema = z.enum(['Unknown', 'Granted', 'Denied', 'Withdrawn']);

// --- Contact methods & consent -------------------------------------------

export const contactConsentSchema = z.object({
  status: consentStatusSchema,
  source: z.string().nullable(),
  grantedAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
});
export type ContactConsentDto = z.infer<typeof contactConsentSchema>;

export const contactMethodSchema = z.object({
  id: z.string(),
  type: contactMethodTypeSchema,
  value: z.string(),
  isPrimary: z.boolean(),
  archivedAt: z.string().datetime().nullable(),
  consent: contactConsentSchema.nullable(),
});
export type ContactMethodDto = z.infer<typeof contactMethodSchema>;

export const createContactMethodRequestSchema = z.object({
  type: contactMethodTypeSchema,
  value: z.string().min(1).max(255),
  isPrimary: z.boolean().optional(),
});
export type CreateContactMethodRequest = z.infer<typeof createContactMethodRequestSchema>;

export const updateContactMethodRequestSchema = z.object({
  value: z.string().min(1).max(255).optional(),
  isPrimary: z.boolean().optional(),
});
export type UpdateContactMethodRequest = z.infer<typeof updateContactMethodRequestSchema>;

export const updateConsentRequestSchema = z.object({
  status: consentStatusSchema,
  source: z.string().max(255).optional(),
});
export type UpdateConsentRequest = z.infer<typeof updateConsentRequestSchema>;

// --- Relationships ---------------------------------------------------------

export const personRelationshipSchema = z.object({
  id: z.string(),
  relatedPersonId: z.string(),
  relatedPersonDisplayName: z.string(),
  relationshipType: relationshipTypeSchema,
  startedAt: z.string().datetime(),
  archivedAt: z.string().datetime().nullable(),
});
export type PersonRelationshipDto = z.infer<typeof personRelationshipSchema>;

export const createRelationshipRequestSchema = z.object({
  relatedPersonId: z.string().min(1),
  relationshipType: relationshipTypeSchema,
  /** Overrides the automatically-derived inverse relationship type (e.g. for `Other`). */
  inverseRelationshipType: relationshipTypeSchema.optional(),
});
export type CreateRelationshipRequest = z.infer<typeof createRelationshipRequestSchema>;

// --- Household membership ---------------------------------------------------

export const householdMembershipSchema = z.object({
  id: z.string(),
  householdId: z.string(),
  householdName: z.string(),
  householdRole: householdRoleSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
});
export type HouseholdMembershipDto = z.infer<typeof householdMembershipSchema>;

export const addHouseholdMembershipRequestSchema = z.object({
  householdId: z.string().min(1),
  householdRole: householdRoleSchema.optional(),
  /** When true, ends any other current membership for this person before adding this one. */
  endOtherCurrentMemberships: z.boolean().optional(),
});
export type AddHouseholdMembershipRequest = z.infer<typeof addHouseholdMembershipRequestSchema>;

// --- Person -----------------------------------------------------------------

export const personSummarySchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  preferredName: z.string().nullable(),
  gender: genderSchema,
  isMinor: z.boolean(),
  isActive: z.boolean(),
  primaryHouseholdName: z.string().nullable(),
});
export type PersonSummaryDto = z.infer<typeof personSummarySchema>;

/**
 * Full person detail. `dateOfBirth` and `contactMethods` are `null` /
 * empty-with-`restricted: true` when the requesting user lacks the
 * `minors.contact.read` permission and this person is a minor — the API
 * never simply omits the key, so clients can distinguish "no data
 * recorded" from "redacted by policy".
 */
export const personDetailSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  preferredName: z.string().nullable(),
  gender: genderSchema,
  dateOfBirth: z.string().date().nullable(),
  isMinor: z.boolean(),
  isActive: z.boolean(),
  /** True when minor-restricted fields (dateOfBirth, contactMethods) were withheld for this viewer. */
  restricted: z.boolean(),
  contactMethods: z.array(contactMethodSchema),
  householdMemberships: z.array(householdMembershipSchema),
  relationships: z.array(personRelationshipSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type PersonDetailDto = z.infer<typeof personDetailSchema>;

export const createPersonRequestSchema = z.object({
  firstName: z.string().min(1).max(255),
  lastName: z.string().min(1).max(255),
  preferredName: z.string().max(255).optional(),
  gender: genderSchema.optional(),
  dateOfBirth: z.string().date().optional(),
});
export type CreatePersonRequest = z.infer<typeof createPersonRequestSchema>;

export const updatePersonRequestSchema = z.object({
  firstName: z.string().min(1).max(255).optional(),
  lastName: z.string().min(1).max(255).optional(),
  preferredName: z.string().max(255).nullable().optional(),
  gender: genderSchema.optional(),
  dateOfBirth: z.string().date().nullable().optional(),
});
export type UpdatePersonRequest = z.infer<typeof updatePersonRequestSchema>;

export const personSearchQuerySchema = z.object({
  query: z.string().max(255).optional(),
  includeInactive: z.coerce.boolean().optional(),
  householdId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type PersonSearchQuery = z.infer<typeof personSearchQuerySchema>;

export const personListResponseSchema = z.object({
  people: z.array(personSummarySchema),
});
export type PersonListResponse = z.infer<typeof personListResponseSchema>;

// --- Household ---------------------------------------------------------------

export const householdMemberSummarySchema = z.object({
  personId: z.string(),
  displayName: z.string(),
  householdRole: householdRoleSchema,
  isMinor: z.boolean(),
});
export type HouseholdMemberSummaryDto = z.infer<typeof householdMemberSummarySchema>;

export const householdDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  addressLine1: z.string().nullable(),
  addressLine2: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postalCode: z.string().nullable(),
  country: z.string().nullable(),
  isActive: z.boolean(),
  members: z.array(householdMemberSummarySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type HouseholdDetailDto = z.infer<typeof householdDetailSchema>;

export const createHouseholdRequestSchema = z.object({
  name: z.string().min(1).max(255),
  addressLine1: z.string().max(255).optional(),
  addressLine2: z.string().max(255).optional(),
  city: z.string().max(255).optional(),
  state: z.string().max(255).optional(),
  postalCode: z.string().max(32).optional(),
  country: z.string().max(255).optional(),
});
export type CreateHouseholdRequest = z.infer<typeof createHouseholdRequestSchema>;

export const updateHouseholdRequestSchema = createHouseholdRequestSchema.partial();
export type UpdateHouseholdRequest = z.infer<typeof updateHouseholdRequestSchema>;

export const householdListResponseSchema = z.object({
  households: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      isActive: z.boolean(),
      memberCount: z.number().int(),
    }),
  ),
});
export type HouseholdListResponse = z.infer<typeof householdListResponseSchema>;
