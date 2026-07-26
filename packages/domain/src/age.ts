// Age and minor-status rules.
//
// AGENTS.md #14 and .cursor/rules/security.mdc require minor contact
// information to be restricted by permission. These pure helpers compute
// minor status from a date of birth so the application layer never has to
// duplicate the "what counts as a minor" rule.

/** A ward member under this age is treated as a minor for data access purposes. */
export const MINOR_AGE_THRESHOLD_YEARS = 18;

/**
 * Calculates a person's age in whole years as of `asOf` (defaults to now).
 * Returns `null` when `dateOfBirth` is unknown, since date of birth is
 * optional in the directory (see AGENTS.md #5 / minimization requirements).
 */
export function calculateAgeYears(dateOfBirth: Date | null | undefined, asOf: Date = new Date()): number | null {
  if (!dateOfBirth) {
    return null;
  }

  let age = asOf.getFullYear() - dateOfBirth.getFullYear();
  const asOfIsBeforeBirthdayThisYear =
    asOf.getMonth() < dateOfBirth.getMonth() ||
    (asOf.getMonth() === dateOfBirth.getMonth() && asOf.getDate() < dateOfBirth.getDate());

  if (asOfIsBeforeBirthdayThisYear) {
    age -= 1;
  }

  return age;
}

/**
 * Whether a person should be treated as a minor for the purposes of
 * restricting date-of-birth and contact-information access.
 *
 * Unknown date of birth is treated as "assume minor" (fail closed) rather
 * than "assume adult" — callers that need to grant broader access on
 * unknown data must do so explicitly and deliberately, not by default.
 */
export function isMinor(dateOfBirth: Date | null | undefined, asOf: Date = new Date()): boolean {
  const age = calculateAgeYears(dateOfBirth, asOf);
  if (age === null) {
    return true;
  }

  return age < MINOR_AGE_THRESHOLD_YEARS;
}
