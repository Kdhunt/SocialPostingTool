import { z } from 'zod';

export const connectFacebookPageRequestSchema = z.object({
  pageId: z.string().min(1).max(64),
  pageAccessToken: z.string().min(1).max(4096),
  pageName: z.string().min(1).max(255).optional(),
});
export type ConnectFacebookPageRequest = z.infer<typeof connectFacebookPageRequestSchema>;

export const chooseFacebookPageRequestSchema = z.object({
  pageId: z.string().min(1).max(64),
});
export type ChooseFacebookPageRequest = z.infer<typeof chooseFacebookPageRequestSchema>;

export const facebookPageConnectionSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
  destinationId: z.string(),
  credentialId: z.string(),
});
export type FacebookPageConnectionDto = z.infer<typeof facebookPageConnectionSchema>;

export const facebookPageChoiceSchema = z.object({
  pageId: z.string(),
  pageName: z.string(),
});
export type FacebookPageChoiceDto = z.infer<typeof facebookPageChoiceSchema>;

export const facebookPageConnectionListResponseSchema = z.object({
  oauthEnabled: z.boolean(),
  connections: z.array(facebookPageConnectionSchema),
});
export type FacebookPageConnectionListResponse = z.infer<typeof facebookPageConnectionListResponseSchema>;

export const facebookPageOauthStartResponseSchema = z.object({
  authorizationUrl: z.string().url(),
});
export type FacebookPageOauthStartResponse = z.infer<typeof facebookPageOauthStartResponseSchema>;

export const facebookPageOauthChoicesResponseSchema = z.object({
  pages: z.array(facebookPageChoiceSchema),
});
export type FacebookPageOauthChoicesResponse = z.infer<typeof facebookPageOauthChoicesResponseSchema>;
