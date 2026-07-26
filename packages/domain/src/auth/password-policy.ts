// Password strength policy — pure validation only. The actual hashing
// algorithm (Argon2id) is an infrastructure concern implemented as an
// adapter in apps/api (see AGENTS.md: keep provider/crypto SDKs out of
// the domain package).

export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * A short blocklist of extremely common/weak passwords. Not exhaustive —
 * real deployments should pair this with a breached-password check — but
 * enough to reject the most obviously weak choices.
 */
const COMMON_WEAK_PASSWORDS = new Set([
  'password',
  'password123',
  'password1234',
  '123456789012',
  'letmein12345',
  'qwertyuiop12',
  'changeme1234',
]);

export function validatePasswordStrength(password: string): PasswordValidationResult {
  const errors: string[] = [];

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.push(`Password must be at least ${PASSWORD_MIN_LENGTH} characters.`);
  }

  if (!/[a-zA-Z]/.test(password)) {
    errors.push('Password must contain at least one letter.');
  }

  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number.');
  }

  if (COMMON_WEAK_PASSWORDS.has(password.toLowerCase())) {
    errors.push('Password is too common. Choose a less predictable password.');
  }

  return { valid: errors.length === 0, errors };
}
