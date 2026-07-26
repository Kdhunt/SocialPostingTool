import { z } from 'zod';
import { communicationChannelSchema } from './audience.schema.js';

// Request/response contracts for the Phase 7 campaign drafting workflow
// (base message/image, per-audience and per-channel overrides, draft
// persistence, preview, validation, and status transitions). No real
// provider send happens in this phase (phases/07-campaigns.md) — these
// contracts describe drafting and review only.

export const campaignStatusSchema = z.enum([
  'Draft',
  'PendingApproval',
  'Approved',
  'Rejected',
  'Scheduled',
  'Sending',
  'Sent',
  'Cancelled',
]);
export type CampaignStatusDto = z.infer<typeof campaignStatusSchema>;

export const campaignApprovalDecisionSchema = z.enum(['Approved', 'Rejected']);

// --- Assets ----------------------------------------------------------------

export const campaignAssetSchema = z.object({
  id: z.string(),
  storageReference: z.string(),
  contentType: z.string(),
  altText: z.string(),
  createdAt: z.string().datetime(),
});
export type CampaignAssetDto = z.infer<typeof campaignAssetSchema>;

export const createCampaignAssetRequestSchema = z.object({
  storageReference: z.string().min(1),
  contentType: z.string().min(1).max(255),
  altText: z.string().min(1).max(1000),
});
export type CreateCampaignAssetRequest = z.infer<typeof createCampaignAssetRequestSchema>;

// --- Campaign version content ------------------------------------------------

export const campaignChannelVersionSchema = z.object({
  channel: communicationChannelSchema,
  text: z.string(),
});
export type CampaignChannelVersionDto = z.infer<typeof campaignChannelVersionSchema>;

export const setCampaignChannelTextRequestSchema = z.object({
  channel: communicationChannelSchema,
  text: z.string().min(1).max(10000),
});
export type SetCampaignChannelTextRequest = z.infer<typeof setCampaignChannelTextRequestSchema>;

export const campaignAudienceSchema = z.object({
  audienceGroupId: z.string(),
  audienceGroupName: z.string(),
  overrideText: z.string().nullable(),
  overrideImageAssetId: z.string().nullable(),
});
export type CampaignAudienceDto = z.infer<typeof campaignAudienceSchema>;

export const addCampaignAudienceRequestSchema = z.object({
  audienceGroupId: z.string().min(1),
  overrideText: z.string().max(10000).optional(),
  overrideImageAssetId: z.string().optional(),
});
export type AddCampaignAudienceRequest = z.infer<typeof addCampaignAudienceRequestSchema>;

export const updateCampaignAudienceRequestSchema = z.object({
  overrideText: z.string().max(10000).nullable().optional(),
  overrideImageAssetId: z.string().nullable().optional(),
});
export type UpdateCampaignAudienceRequest = z.infer<typeof updateCampaignAudienceRequestSchema>;

export const campaignDestinationSchema = z.object({
  destinationId: z.string(),
  name: z.string(),
  channel: communicationChannelSchema,
  isActive: z.boolean(),
});
export type CampaignDestinationDto = z.infer<typeof campaignDestinationSchema>;

export const campaignVersionSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int(),
  baseMessage: z.string().nullable(),
  baseImageAssetId: z.string().nullable(),
  channelVersions: z.array(campaignChannelVersionSchema),
  audiences: z.array(campaignAudienceSchema),
  destinations: z.array(campaignDestinationSchema),
  createdAt: z.string().datetime(),
});
export type CampaignVersionDto = z.infer<typeof campaignVersionSchema>;

export const updateCampaignVersionRequestSchema = z.object({
  baseMessage: z.string().max(10000).nullable().optional(),
  baseImageAssetId: z.string().nullable().optional(),
});
export type UpdateCampaignVersionRequest = z.infer<typeof updateCampaignVersionRequestSchema>;

// --- Approvals & schedule --------------------------------------------------

export const campaignApprovalSchema = z.object({
  id: z.string(),
  campaignVersionId: z.string(),
  decision: campaignApprovalDecisionSchema,
  comment: z.string().nullable(),
  approverUserId: z.string().nullable(),
  decidedAt: z.string().datetime(),
});
export type CampaignApprovalDto = z.infer<typeof campaignApprovalSchema>;

export const decideCampaignApprovalRequestSchema = z.object({
  comment: z.string().max(2000).optional(),
});
export type DecideCampaignApprovalRequest = z.infer<typeof decideCampaignApprovalRequestSchema>;

export const campaignScheduleSchema = z.object({
  id: z.string(),
  scheduledFor: z.string().datetime(),
  cancelledAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type CampaignScheduleDto = z.infer<typeof campaignScheduleSchema>;

export const scheduleCampaignRequestSchema = z.object({
  scheduledFor: z.string().datetime(),
});
export type ScheduleCampaignRequest = z.infer<typeof scheduleCampaignRequestSchema>;

// --- Campaign ----------------------------------------------------------------

export const campaignSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: campaignStatusSchema,
  isActive: z.boolean(),
  currentVersionNumber: z.number().int(),
  audienceCount: z.number().int(),
  updatedAt: z.string().datetime(),
});
export type CampaignSummaryDto = z.infer<typeof campaignSummarySchema>;

export const campaignDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  status: campaignStatusSchema,
  isActive: z.boolean(),
  currentVersion: campaignVersionSchema,
  approvals: z.array(campaignApprovalSchema),
  schedules: z.array(campaignScheduleSchema),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CampaignDetailDto = z.infer<typeof campaignDetailSchema>;

export const createCampaignRequestSchema = z.object({
  name: z.string().min(1).max(255),
  baseMessage: z.string().max(10000).optional(),
});
export type CreateCampaignRequest = z.infer<typeof createCampaignRequestSchema>;

export const updateCampaignRequestSchema = z.object({
  name: z.string().min(1).max(255).optional(),
});
export type UpdateCampaignRequest = z.infer<typeof updateCampaignRequestSchema>;

export const campaignSearchQuerySchema = z.object({
  query: z.string().max(255).optional(),
  status: campaignStatusSchema.optional(),
  includeArchived: z.coerce.boolean().optional(),
});
export type CampaignSearchQuery = z.infer<typeof campaignSearchQuerySchema>;

export const campaignListResponseSchema = z.object({
  campaigns: z.array(campaignSummarySchema),
});
export type CampaignListResponse = z.infer<typeof campaignListResponseSchema>;

// --- Preview -----------------------------------------------------------------

export const campaignPreviewChannelSchema = z.object({
  channel: communicationChannelSchema,
  text: z.string().nullable(),
  length: z.number().int(),
  exceedsLimit: z.boolean(),
});
export type CampaignPreviewChannelDto = z.infer<typeof campaignPreviewChannelSchema>;

export const campaignPreviewAudienceSchema = z.object({
  audienceGroupId: z.string(),
  audienceGroupName: z.string(),
  recipientCount: z.number().int(),
  resolvedImageAssetId: z.string().nullable(),
  channels: z.array(campaignPreviewChannelSchema),
});
export type CampaignPreviewAudienceDto = z.infer<typeof campaignPreviewAudienceSchema>;

export const campaignPreviewResponseSchema = z.object({
  versionNumber: z.number().int(),
  totalUniqueRecipients: z.number().int(),
  overlapCount: z.number().int(),
  audiences: z.array(campaignPreviewAudienceSchema),
});
export type CampaignPreviewResponse = z.infer<typeof campaignPreviewResponseSchema>;

export const campaignValidationResponseSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
});
export type CampaignValidationResponse = z.infer<typeof campaignValidationResponseSchema>;
