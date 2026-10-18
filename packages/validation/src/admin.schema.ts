import { z } from 'zod';
import { applicationUserEmailSchema } from './email.schema.js';

export const userSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().nullable(),
  emailVerifiedAt: z.string().datetime().nullable(),
  displayName: z.string(),
  disabledAt: z.string().datetime().nullable(),
  lastLoginAt: z.string().datetime().nullable(),
  roleIds: z.array(z.string()),
  roleNames: z.array(z.string()),
});
export type UserSummaryDto = z.infer<typeof userSummarySchema>;

export const userListResponseSchema = z.object({
  users: z.array(userSummarySchema),
});
export type UserListResponse = z.infer<typeof userListResponseSchema>;

export const createUserRequestSchema = z.object({
  username: z
    .string()
    .min(1, 'Username is required.')
    .max(255, 'Username must be at most 255 characters.'),
  email: applicationUserEmailSchema,
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(512, 'Password must be at most 512 characters.'),
  displayName: z
    .string()
    .min(1, 'Display name is required.')
    .max(255, 'Display name must be at most 255 characters.'),
  roleIds: z.array(z.string().uuid()).min(1, 'Select at least one role.'),
});
export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;

export const assignUserRolesRequestSchema = z.object({
  roleIds: z.array(z.string().uuid()).min(1),
});
export type AssignUserRolesRequest = z.infer<typeof assignUserRolesRequestSchema>;

export const roleSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
});
export type RoleSummaryDto = z.infer<typeof roleSummarySchema>;

export const roleListResponseSchema = z.object({
  roles: z.array(roleSummarySchema),
});
export type RoleListResponse = z.infer<typeof roleListResponseSchema>;

export const wardCodeInfoSchema = z.object({
  version: z.number().int(),
  activatedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type WardCodeInfoDto = z.infer<typeof wardCodeInfoSchema>;

export const rotateWardCodeRequestSchema = z.object({
  newWardCode: z
    .string()
    .min(4, 'Ward code must be at least 4 characters.')
    .max(255, 'Ward code must be at most 255 characters.'),
});
export type RotateWardCodeRequest = z.infer<typeof rotateWardCodeRequestSchema>;

export const resetPasswordRequestSchema = z.object({
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(512, 'Password must be at most 512 characters.'),
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const updateUserEmailRequestSchema = z.object({
  email: applicationUserEmailSchema,
});
export type UpdateUserEmailRequest = z.infer<typeof updateUserEmailRequestSchema>;

/** Church hierarchy level, smallest first. Mirrors UNIT_LEVELS in @ward-comms/domain. */
export const unitLevelSchema = z.enum(['Ward', 'Stake', 'Region', 'District']);
export type UnitLevelDto = z.infer<typeof unitLevelSchema>;

export const wardSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  level: unitLevelSchema,
  parentId: z.string().nullable(),
  publicSlug: z.string(),
  timeZone: z.string(),
  createdAt: z.string().datetime(),
});
export type WardSummaryDto = z.infer<typeof wardSummarySchema>;

export const wardAdminSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  email: z.string().nullable(),
  displayName: z.string(),
});
export type WardAdminSummaryDto = z.infer<typeof wardAdminSummarySchema>;

export const platformWardSummarySchema = wardSummarySchema.extend({
  admins: z.array(wardAdminSummarySchema),
});
export type PlatformWardSummaryDto = z.infer<typeof platformWardSummarySchema>;

export const wardListResponseSchema = z.object({
  wards: z.array(platformWardSummarySchema),
});
export type WardListResponse = z.infer<typeof wardListResponseSchema>;

export const createWardRequestSchema = z.object({
  name: z.string().min(1, 'Name is required.').max(255, 'Name must be at most 255 characters.'),
  /** Defaults to Ward. */
  level: unitLevelSchema.optional(),
  /** The unit directly above, which must be exactly one level up. */
  parentId: z.string().min(1).optional(),
  timeZone: z
    .string()
    .min(1, 'Enter a valid IANA time zone (for example, America/Denver).')
    .max(64, 'Time zone must be at most 64 characters.')
    .optional(),
  adminUsername: z
    .string()
    .min(1, 'Admin username is required.')
    .max(255, 'Admin username must be at most 255 characters.'),
  adminEmail: applicationUserEmailSchema,
  adminDisplayName: z
    .string()
    .min(1, 'Admin display name is required.')
    .max(255, 'Admin display name must be at most 255 characters.'),
  adminPassword: z
    .string()
    .min(12, 'Admin password must be at least 12 characters.')
    .max(512, 'Admin password must be at most 512 characters.'),
  initialWardCode: z
    .string()
    .min(4, 'Ward code must be at least 4 characters.')
    .max(255, 'Ward code must be at most 255 characters.'),
  publicSlug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]{2,64}$/, 'Public page path may contain only lowercase letters and numbers.')
    .optional(),
});
export type CreateWardRequest = z.infer<typeof createWardRequestSchema>;

export const setUnitParentRequestSchema = z.object({
  /** null removes the unit from the hierarchy (platform operators only). */
  parentId: z.string().min(1).nullable(),
});
export type SetUnitParentRequest = z.infer<typeof setUnitParentRequestSchema>;

/** GET /admin/units: the caller's own unit plus every unit beneath it. */
export const unitTreeResponseSchema = z.object({
  unit: wardSummarySchema,
  units: z.array(platformWardSummarySchema),
});
export type UnitTreeResponse = z.infer<typeof unitTreeResponseSchema>;

export function fieldErrorsFromZodError(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && fieldErrors[key] === undefined) {
      fieldErrors[key] = issue.message;
    }
  }
  return fieldErrors;
}

export function fieldErrorsFromUnknown(error: unknown): Record<string, string> | null {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('name' in error) ||
    error.name !== 'ZodError' ||
    !('issues' in error) ||
    !Array.isArray(error.issues)
  ) {
    return null;
  }
  return fieldErrorsFromZodError(error as z.ZodError);
}

export const createWardResponseSchema = z.object({
  ward: wardSummarySchema,
  adminUserId: z.string(),
  adminUsername: z.string(),
  adminEmail: z.string(),
});
export type CreateWardResponse = z.infer<typeof createWardResponseSchema>;

export const auditEventSchema = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  actorUserId: z.string().nullable(),
  actorDisplayName: z.string().nullable(),
  metadata: z.record(z.unknown()).nullable(),
  ipAddress: z.string().nullable(),
  createdAt: z.string().datetime(),
});
export type AuditEventDto = z.infer<typeof auditEventSchema>;

export const auditListResponseSchema = z.object({
  events: z.array(auditEventSchema),
});
export type AuditListResponse = z.infer<typeof auditListResponseSchema>;

export const auditSearchQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  action: z.string().max(255).optional(),
  entityType: z.string().max(255).optional(),
});
export type AuditSearchQuery = z.infer<typeof auditSearchQuerySchema>;
