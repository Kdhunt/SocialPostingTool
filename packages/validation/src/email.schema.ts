import { normalizeEmail } from '@ward-comms/domain';
import { z } from 'zod';

export const EMAIL_REQUIRED_MESSAGE = 'Email address is required.';
export const EMAIL_INVALID_MESSAGE = 'Enter a valid email address.';
export const EMAIL_TOO_LONG_MESSAGE = 'Email address must be at most 255 characters.';

/**
 * Required application-user email. Reuses domain `normalizeEmail` so
 * format checks and lowercase/trim stay in one place. Parsed output is
 * the normalized address.
 */
export const applicationUserEmailSchema = z
  .string({
    required_error: EMAIL_REQUIRED_MESSAGE,
    invalid_type_error: EMAIL_REQUIRED_MESSAGE,
  })
  .min(1, EMAIL_REQUIRED_MESSAGE)
  .max(255, EMAIL_TOO_LONG_MESSAGE)
  .transform((value, ctx) => {
    const normalized = normalizeEmail(value);
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: EMAIL_INVALID_MESSAGE,
      });
      return z.NEVER;
    }
    return normalized;
  });
