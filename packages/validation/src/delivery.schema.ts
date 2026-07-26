import { z } from 'zod';
import { communicationChannelSchema } from './audience.schema.js';

export const deliveryBatchStatusSchema = z.enum(['Pending', 'Running', 'Completed', 'PartialFailure', 'Failed']);
export type DeliveryBatchStatusDto = z.infer<typeof deliveryBatchStatusSchema>;

export const deliveryRecipientStatusSchema = z.enum([
  'Pending',
  'Queued',
  'Sending',
  'Sent',
  'Retrying',
  'DeadLettered',
  'Skipped',
]);
export type DeliveryRecipientStatusDto = z.infer<typeof deliveryRecipientStatusSchema>;

export const deliveryAttemptStatusSchema = z.enum(['Succeeded', 'Failed', 'PermanentFailure']);
export type DeliveryAttemptStatusDto = z.infer<typeof deliveryAttemptStatusSchema>;

export const deliveryAttemptSchema = z.object({
  id: z.string(),
  attemptNumber: z.number().int(),
  status: deliveryAttemptStatusSchema,
  providerMessageId: z.string().nullable(),
  errorCode: z.string().nullable(),
  errorMessage: z.string().nullable(),
  attemptedAt: z.string().datetime(),
});
export type DeliveryAttemptDto = z.infer<typeof deliveryAttemptSchema>;

export const deliveryRecipientSchema = z.object({
  id: z.string(),
  personId: z.string().nullable(),
  channel: communicationChannelSchema,
  destinationId: z.string().nullable(),
  status: deliveryRecipientStatusSchema,
  skipReason: z.string().nullable(),
  attemptCount: z.number().int(),
  attempts: z.array(deliveryAttemptSchema),
});
export type DeliveryRecipientDto = z.infer<typeof deliveryRecipientSchema>;

export const deliveryBatchSummarySchema = z.object({
  id: z.string(),
  campaignId: z.string(),
  campaignVersionId: z.string(),
  status: deliveryBatchStatusSchema,
  totalRecipients: z.number().int(),
  sentCount: z.number().int(),
  deadLetteredCount: z.number().int(),
  skippedCount: z.number().int(),
  createdAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
});
export type DeliveryBatchSummaryDto = z.infer<typeof deliveryBatchSummarySchema>;

export const deliveryBatchDetailSchema = deliveryBatchSummarySchema.extend({
  recipients: z.array(deliveryRecipientSchema),
});
export type DeliveryBatchDetailDto = z.infer<typeof deliveryBatchDetailSchema>;

export const deliveryBatchListResponseSchema = z.object({
  batches: z.array(deliveryBatchSummarySchema),
});
export type DeliveryBatchListResponse = z.infer<typeof deliveryBatchListResponseSchema>;
