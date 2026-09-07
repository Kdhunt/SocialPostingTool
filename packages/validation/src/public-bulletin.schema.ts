import { z } from 'zod';

export const publicWardSlugParamSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]{2,64}$/, 'Public page path may contain only lowercase letters and numbers.');

export const publicBulletinCampaignSchema = z.object({
  id: z.string(),
  name: z.string(),
  publishedAt: z.string().datetime(),
  message: z.string().nullable(),
  imageUrl: z.string().url().nullable(),
  imageAltText: z.string().nullable(),
});
export type PublicBulletinCampaignDto = z.infer<typeof publicBulletinCampaignSchema>;

export const publicWardBulletinResponseSchema = z.object({
  wardName: z.string(),
  wardSlug: z.string(),
  timeZone: z.string(),
  campaigns: z.array(publicBulletinCampaignSchema),
});
export type PublicWardBulletinResponse = z.infer<typeof publicWardBulletinResponseSchema>;

export const updateWardPublicSlugRequestSchema = z.object({
  publicSlug: publicWardSlugParamSchema,
});
export type UpdateWardPublicSlugRequest = z.infer<typeof updateWardPublicSlugRequestSchema>;
