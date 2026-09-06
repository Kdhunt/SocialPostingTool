import { describe, expect, it } from 'vitest';
import {
  applicationUserEmailSchema,
  EMAIL_INVALID_MESSAGE,
  EMAIL_REQUIRED_MESSAGE,
  EMAIL_TOO_LONG_MESSAGE,
} from './email.schema.js';

describe('applicationUserEmailSchema', () => {
  it('requires a non-empty value', () => {
    const result = applicationUserEmailSchema.safeParse('');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(EMAIL_REQUIRED_MESSAGE);
  });

  it('rejects an implausible address', () => {
    const result = applicationUserEmailSchema.safeParse('not-an-email');
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(EMAIL_INVALID_MESSAGE);
  });

  it('rejects an address longer than 255 characters', () => {
    const result = applicationUserEmailSchema.safeParse(`${'a'.repeat(250)}@example.com`);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe(EMAIL_TOO_LONG_MESSAGE);
  });

  it('trims and lowercases a valid address via domain normalizeEmail', () => {
    expect(applicationUserEmailSchema.parse('  Jane.Doe+tag@Example.COM  ')).toBe(
      'jane.doe+tag@example.com',
    );
  });
});
