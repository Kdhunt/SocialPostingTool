import { z } from 'zod';

// Request/response contracts for the Phase 6 audience groups and
// communication destinations. Audience group names are never hardcoded
// anywhere in this package or the services that use it — a ward chooses
// its own names through these generic create/rename requests.

export const communicationChannelSchema = z.enum(['Email', 'Sms', 'FacebookPage']);
export type CommunicationChannel = z.infer<typeof communicationChannelSchema>;

// --- Communication destinations ------------------------------------------------

export const communicationDestinationSchema = z.object({
  id: z.string(),
  name: z.string(),
  channel: communicationChannelSchema,
  providerAccountReference: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
});
export type CommunicationDestinationDto = z.infer<typeof communicationDestinationSchema>;

export const createCommunicationDestinationRequestSchema = z.object({
  name: z.string().min(1).max(255),
  channel: communicationChannelSchema,
  providerAccountReference: z.string().max(255).optional(),
});
export type CreateCommunicationDestinationRequest = z.infer<typeof createCommunicationDestinationRequestSchema>;

export const destinationListResponseSchema = z.object({
  destinations: z.array(communicationDestinationSchema),
});
export type DestinationListResponse = z.infer<typeof destinationListResponseSchema>;

// --- Audience groups -----------------------------------------------------------

export const audienceMemberSummarySchema = z.object({
  personId: z.string(),
  displayName: z.string(),
  isMinor: z.boolean(),
  isActive: z.boolean(),
  source: z.enum(['Manual', 'Rules']).optional(),
});
export type AudienceMemberSummaryDto = z.infer<typeof audienceMemberSummarySchema>;

export const audienceDestinationSummarySchema = z.object({
  destinationId: z.string(),
  name: z.string(),
  channel: communicationChannelSchema,
});
export type AudienceDestinationSummaryDto = z.infer<typeof audienceDestinationSummarySchema>;

export const audienceGroupSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  memberCount: z.number().int(),
  destinationCount: z.number().int(),
});
export type AudienceGroupSummaryDto = z.infer<typeof audienceGroupSummarySchema>;

export const audienceGroupDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  membershipMode: z.enum(['Manual', 'Rules']).optional(),
  membershipRules: z
    .object({
      ageMin: z.number().int().optional(),
      ageMax: z.number().int().optional(),
      genders: z.array(z.enum(['Male', 'Female', 'NotSpecified'])).optional(),
      householdRoles: z.array(z.enum(['Head', 'Member'])).optional(),
    })
    .nullable()
    .optional(),
  members: z.array(audienceMemberSummarySchema),
  destinations: z.array(audienceDestinationSummarySchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AudienceGroupDetailDto = z.infer<typeof audienceGroupDetailSchema>;

export const createAudienceGroupRequestSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
});
export type CreateAudienceGroupRequest = z.infer<typeof createAudienceGroupRequestSchema>;

export const updateAudienceGroupRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
});
export type UpdateAudienceGroupRequest = z.infer<typeof updateAudienceGroupRequestSchema>;

export const addAudienceMemberRequestSchema = z.object({
  personId: z.string().min(1),
});
export type AddAudienceMemberRequest = z.infer<typeof addAudienceMemberRequestSchema>;

export const addAudienceDestinationRequestSchema = z.object({
  destinationId: z.string().min(1),
});
export type AddAudienceDestinationRequest = z.infer<typeof addAudienceDestinationRequestSchema>;

export const audienceSearchQuerySchema = z.object({
  query: z.string().max(255).optional(),
  includeArchived: z.coerce.boolean().optional(),
});
export type AudienceSearchQuery = z.infer<typeof audienceSearchQuerySchema>;

export const audienceListResponseSchema = z.object({
  audiences: z.array(audienceGroupSummarySchema),
});
export type AudienceListResponse = z.infer<typeof audienceListResponseSchema>;

/**
 * Response for previewing one or more audiences combined. `members` is
 * already deduplicated across the provided audience ids (a person in two
 * of the combined audiences appears once, with both audience ids listed)
 * — see `@ward-comms/domain`'s `mergeAudienceMemberships` (AGENTS.md #7:
 * never silently send duplicate messages to overlapping audiences).
 */
export const audiencePreviewResponseSchema = z.object({
  totalCount: z.number().int(),
  overlapCount: z.number().int(),
  members: z.array(
    z.object({
      personId: z.string(),
      displayName: z.string(),
      isMinor: z.boolean(),
      audienceGroupIds: z.array(z.string()),
    }),
  ),
});
export type AudiencePreviewResponse = z.infer<typeof audiencePreviewResponseSchema>;

export const audiencePreviewRequestSchema = z.object({
  audienceGroupIds: z.array(z.string().min(1)).min(1),
});
export type AudiencePreviewRequest = z.infer<typeof audiencePreviewRequestSchema>;
