import { describe, expect, it } from 'vitest';
import { validatePasswordStrength } from './password-policy.js';

describe('validatePasswordStrength', () => {
  it('accepts a sufficiently long password with letters and numbers', () => {
    const result = validatePasswordStrength('Fictional-Password-42');
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects a password that is too short', () => {
    const result = validatePasswordStrength('Short1');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must be at least 12 characters.');
  });

  it('rejects a password with no letters', () => {
    const result = validatePasswordStrength('123456789012');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one letter.');
  });

  it('rejects a password with no numbers', () => {
    const result = validatePasswordStrength('AllLettersHereNoNumbers');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Password must contain at least one number.');
  });

  it('rejects a common weak password regardless of length rules', () => {
    const result = validatePasswordStrength('password1234');
    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('too common'))).toBe(true);
  });

  it('accepts the fictional dev seed password', () => {
    const result = validatePasswordStrength('ChangeMeNow!23');
    expect(result.valid).toBe(true);
  });
});
