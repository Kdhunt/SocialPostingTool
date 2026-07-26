// Preferred/primary contact method rules.
//
// A person may have multiple contact methods (schema.prisma ContactMethod)
// but at most one "primary"/preferred method per channel type (Email,
// Phone). These pure helpers compute the primary-flag updates needed when
// a new method is added or an existing one is promoted, so the app
// service never has to hand-roll this invariant with ad hoc queries.

import type { ContactMethodType } from '../enums.js';

export interface ContactMethodLike {
  id: string;
  type: ContactMethodType;
  isPrimary: boolean;
}

/**
 * Given the existing contact methods for a person and the id of the
 * method that should become primary, returns the ids of OTHER methods of
 * the same type that must be demoted (their `isPrimary` set to false) so
 * exactly one primary method per type remains.
 */
export function resolvePrimaryDemotions(existing: ContactMethodLike[], newPrimaryId: string): string[] {
  const target = existing.find((method) => method.id === newPrimaryId);
  if (!target) {
    return [];
  }

  return existing
    .filter((method) => method.id !== newPrimaryId && method.type === target.type && method.isPrimary)
    .map((method) => method.id);
}

/**
 * Whether a person has at least one usable (non-archived) contact method
 * of any type. Used to flag incomplete records without blocking their
 * creation — directory entries may legitimately have no contact info yet
 * (e.g. a newborn, or a record still being completed).
 */
export function hasAnyContactMethod(existing: { archivedAt: Date | null }[]): boolean {
  return existing.some((method) => method.archivedAt === null);
}
