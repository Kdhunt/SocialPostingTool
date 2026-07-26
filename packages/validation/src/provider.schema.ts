import { z } from 'zod';
import { communicationChannelSchema } from './audience.schema.js';

export const upsertProviderCredentialRequestSchema = z.object({
  channel: communicationChannelSchema,
  providerAccountReference: z.string().min(1).max(255),
  /** Opaque JSON string of provider-specific secret fields — never logged or echoed. */
  credentialsJson: z.string().min(2).max(20_000),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type UpsertProviderCredentialRequest = z.infer<typeof upsertProviderCredentialRequestSchema>;

export const providerCredentialSummarySchema = z.object({
  id: z.string(),
  channel: communicationChannelSchema,
  providerAccountReference: z.string(),
  encryptionKeyId: z.string(),
  expiresAt: z.string().datetime().nullable(),
  revokedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type ProviderCredentialSummaryDto = z.infer<typeof providerCredentialSummarySchema>;

export const providerCredentialListResponseSchema = z.object({
  credentials: z.array(providerCredentialSummarySchema),
});
export type ProviderCredentialListResponse = z.infer<typeof providerCredentialListResponseSchema>;
