import { describe, expect, it } from 'vitest';
import { calculateAgeYears, isMinor, MINOR_AGE_THRESHOLD_YEARS } from './age.js';

describe('calculateAgeYears', () => {
  it('returns null when date of birth is unknown', () => {
    expect(calculateAgeYears(null)).toBeNull();
    expect(calculateAgeYears(undefined)).toBeNull();
  });

  it('calculates age before the birthday this year', () => {
    const dateOfBirth = new Date('2000-06-15');
    const asOf = new Date('2026-06-01');
    expect(calculateAgeYears(dateOfBirth, asOf)).toBe(25);
  });

  it('calculates age on/after the birthday this year', () => {
    const dateOfBirth = new Date('2000-06-15');
    const asOf = new Date('2026-06-15');
    expect(calculateAgeYears(dateOfBirth, asOf)).toBe(26);
  });
});

describe('isMinor', () => {
  it('treats unknown date of birth as a minor (fail closed)', () => {
    expect(isMinor(null)).toBe(true);
  });

  it('treats someone just under the threshold as a minor', () => {
    const asOf = new Date('2026-01-01');
    const dateOfBirth = new Date(`${2026 - MINOR_AGE_THRESHOLD_YEARS}-06-01`);
    expect(isMinor(dateOfBirth, asOf)).toBe(true);
  });

  it('treats someone at or past the threshold as not a minor', () => {
    const asOf = new Date('2026-06-02');
    const dateOfBirth = new Date(`${2026 - MINOR_AGE_THRESHOLD_YEARS}-06-01`);
    expect(isMinor(dateOfBirth, asOf)).toBe(false);
  });
});
