import { z } from 'zod';

export const userSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
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
  username: z.string().min(1).max(255),
  password: z.string().min(12).max(512),
  displayName: z.string().min(1).max(255),
  roleIds: z.array(z.string().uuid()).min(1),
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
  newWardCode: z.string().min(4).max(255),
});
export type RotateWardCodeRequest = z.infer<typeof rotateWardCodeRequestSchema>;

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
