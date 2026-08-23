// Minor data access policy.
//
// AGENTS.md #14 ("Never expose minor contact information to unauthorized
// roles") and .cursor/rules/security.mdc ("Minimize access to date of
// birth and minor contact information") require date of birth and contact
// methods for minors to be restricted by permission. This pure helper
// centralizes the decision so every app service and controller applies it
// consistently instead of re-deriving it.

import { isMinor } from '../age.js';

export interface MinorAccessCheck {
  dateOfBirth: Date | null | undefined;
  /** Whether the requesting user holds the `minors.contact.read` permission. */
  viewerHasMinorContactPermission: boolean;
  asOf?: Date;
}

/**
 * Whether the viewer may see this person's date of birth and contact
 * methods (email/phone) without redaction.
 *
 * Unknown date of birth is treated as "assume minor" (fail closed) via
 * `isMinor`, so incomplete records default to the more restrictive
 * outcome rather than accidentally exposing data.
 */
export function canViewRestrictedMinorFields(check: MinorAccessCheck): boolean {
  if (!isMinor(check.dateOfBirth, check.asOf)) {
    return true;
  }
  return check.viewerHasMinorContactPermission;
}
