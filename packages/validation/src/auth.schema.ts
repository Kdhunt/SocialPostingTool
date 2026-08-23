import { z } from 'zod';

// Request/response contracts for the Phase 4 authentication flows. These
// are the ONLY shapes that may cross the wire — password hashes, ward code
// hashes, and raw session/refresh tokens must never appear in a response
// schema (see AGENTS.md and .cursor/rules/security.mdc).

export const clientTypeSchema = z.enum(['web', 'mobile']).default('web');
export type ClientType = z.infer<typeof clientTypeSchema>;

export const loginRequestSchema = z.object({
  username: z.string().min(1).max(255),
  password: z.string().min(1).max(512),
  clientType: clientTypeSchema.optional(),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const wardCodeVerifyRequestSchema = z.object({
  loginTicket: z.string().min(1),
  wardCode: z.string().min(1).max(255),
  clientType: clientTypeSchema.optional(),
});
export type WardCodeVerifyRequest = z.infer<typeof wardCodeVerifyRequestSchema>;

export const refreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshRequest = z.infer<typeof refreshRequestSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  wardId: z.string(),
  username: z.string(),
  displayName: z.string(),
  permissions: z.array(z.string()),
  totpEnabled: z.boolean().optional(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** Mobile-only: returned instead of setting a cookie, since mobile clients hold their own tokens. */
export const mobileTokenPairSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.string().datetime(),
});
export type MobileTokenPair = z.infer<typeof mobileTokenPairSchema>;

/** Returned by /auth/login. Multi-step sign-in may require TOTP and/or ward code next. */
export const loginResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('totp_required'), loginTicket: z.string() }),
  z.object({ status: z.literal('ward_code_required'), loginTicket: z.string() }),
  z.object({ status: z.literal('ok'), user: authUserSchema, tokens: mobileTokenPairSchema.optional() }),
]);
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const totpVerifyRequestSchema = z.object({
  loginTicket: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
  clientType: clientTypeSchema.optional(),
});
export type TotpVerifyRequest = z.infer<typeof totpVerifyRequestSchema>;

export const totpVerifyResponseSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('ward_code_required'), loginTicket: z.string() }),
  z.object({ status: z.literal('ok'), user: authUserSchema, tokens: mobileTokenPairSchema.optional() }),
]);
export type TotpVerifyResponse = z.infer<typeof totpVerifyResponseSchema>;

export const totpConfirmEnrollmentRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
});
export type TotpConfirmEnrollmentRequest = z.infer<typeof totpConfirmEnrollmentRequestSchema>;

export const totpDisableRequestSchema = z.object({
  password: z.string().min(1).max(512),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from your authenticator app.'),
});
export type TotpDisableRequest = z.infer<typeof totpDisableRequestSchema>;

export const totpEnrollmentResponseSchema = z.object({
  otpauthUrl: z.string().url(),
  secret: z.string().min(1),
});
export type TotpEnrollmentResponse = z.infer<typeof totpEnrollmentResponseSchema>;

export const totpStatusResponseSchema = z.object({
  enabled: z.boolean(),
  pendingEnrollment: z.boolean(),
});
export type TotpStatusResponse = z.infer<typeof totpStatusResponseSchema>;

export const wardCodeVerifyResponseSchema = z.object({
  status: z.literal('ok'),
  user: authUserSchema,
  tokens: mobileTokenPairSchema.optional(),
});
export type WardCodeVerifyResponse = z.infer<typeof wardCodeVerifyResponseSchema>;

export const sessionResponseSchema = z.object({
  user: authUserSchema,
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/**
 * Public-safe summary of a UserSession row. Deliberately omits
 * sessionTokenHash / refreshTokenHash — those must never cross the wire
 * (see AGENTS.md and .cursor/rules/security.mdc).
 */
export const sessionSummarySchema = z.object({
  id: z.string(),
  deviceId: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  createdAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().nullable(),
  expiresAt: z.string().datetime(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
