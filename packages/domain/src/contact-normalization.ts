// Pure contact-method normalization helpers.
//
// `normalizedValue` on ContactMethod is used for search and duplicate
// detection (see schema.prisma). Normalization must happen consistently
// wherever a contact method is created or updated, so it lives here rather
// than being re-implemented per app.

/**
 * Lowercases and trims an email address for comparison/search purposes.
 * Returns `null` for input that is not a plausible email address; callers
 * should validate with the shared zod schema (packages/validation) before
 * calling this for user-facing error messages.
 */
export function normalizeEmail(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(trimmed) ? trimmed : null;
}

/**
 * Normalizes a phone number to digits-only E.164-style form (assumes a US/
 * Canada default country code of 1 when a 10-digit number is given with no
 * leading country code). Returns `null` when the input does not contain a
 * plausible phone number of 10-15 digits.
 */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d]/g, '');

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}
