import { z } from 'zod';

export const audienceMembershipModeSchema = z.enum(['Manual', 'Rules']);
export type AudienceMembershipModeDto = z.infer<typeof audienceMembershipModeSchema>;

export const audienceMemberSourceSchema = z.enum(['Manual', 'Rules']);
export type AudienceMemberSourceDto = z.infer<typeof audienceMemberSourceSchema>;

export const audienceMembershipRulesSchema = z
  .object({
    ageMin: z.number().int().min(0).optional(),
    ageMax: z.number().int().min(0).optional(),
    genders: z.array(z.enum(['Male', 'Female', 'NotSpecified'])).optional(),
    householdRoles: z.array(z.enum(['Head', 'Member'])).optional(),
  })
  .refine(
    (rules) => rules.ageMin === undefined || rules.ageMax === undefined || rules.ageMin <= rules.ageMax,
    { message: 'ageMin must be less than or equal to ageMax' },
  );
export type AudienceMembershipRulesDto = z.infer<typeof audienceMembershipRulesSchema>;

export const setAudienceRulesRequestSchema = z.object({
  membershipMode: audienceMembershipModeSchema,
  membershipRules: audienceMembershipRulesSchema.nullable(),
});
export type SetAudienceRulesRequest = z.infer<typeof setAudienceRulesRequestSchema>;

export const audienceRulesPreviewResponseSchema = z.object({
  matchCount: z.number().int(),
  members: z.array(
    z.object({
      personId: z.string(),
      displayName: z.string(),
      isMinor: z.boolean(),
    }),
  ),
});
export type AudienceRulesPreviewResponse = z.infer<typeof audienceRulesPreviewResponseSchema>;

export const audienceRulesApplyResponseSchema = z.object({
  addedCount: z.number().int(),
  removedCount: z.number().int(),
});
export type AudienceRulesApplyResponse = z.infer<typeof audienceRulesApplyResponseSchema>;
