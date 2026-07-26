import { describe, expect, it } from 'vitest';
import { normalizeEmail, normalizePhone } from './contact-normalization.js';

describe('normalizeEmail', () => {
  it('lowercases and trims a valid email', () => {
    expect(normalizeEmail('  Jane.Doe@Example.COM  ')).toBe('jane.doe@example.com');
  });

  it('returns null for implausible input', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('assumes +1 for a 10-digit US number', () => {
    expect(normalizePhone('(555) 123-4567')).toBe('+15551234567');
  });

  it('keeps an explicit leading 1 country code', () => {
    expect(normalizePhone('1-555-123-4567')).toBe('+15551234567');
  });

  it('normalizes an international number with more digits', () => {
    expect(normalizePhone('+44 20 7946 0958')).toBe('+442079460958');
  });

  it('returns null for implausible input', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('not a phone number')).toBeNull();
  });
});
