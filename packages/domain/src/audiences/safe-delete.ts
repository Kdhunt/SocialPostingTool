// Safe-delete rule for audience groups.
//
// phases/06-audiences.md requires "delete only when safe". Physically
// deleting an AudienceGroup that still has members or destination links
// would silently orphan those join rows and could surprise a user who
// thought the group was still wired up to a destination. Archiving
// (soft-delete, already supported by `archivedAt`) is always available;
// this rule only governs the additional, irreversible hard-delete path.

export interface AudienceDeletionCheckInput {
  memberCount: number;
  destinationCount: number;
}

export interface AudienceDeletionCheck {
  safe: boolean;
  reason?: string;
}

/**
 * An audience group may only be permanently deleted when it has no
 * members and no destination links — i.e. it was never actually put to
 * use. Otherwise the caller should archive it instead (which preserves
 * the group and its history without allowing further use).
 */
export function checkAudienceSafeToDelete(input: AudienceDeletionCheckInput): AudienceDeletionCheck {
  if (input.memberCount > 0) {
    return { safe: false, reason: 'This audience still has members. Remove all members or archive it instead.' };
  }
  if (input.destinationCount > 0) {
    return {
      safe: false,
      reason: 'This audience is still linked to a communication destination. Unlink it or archive it instead.',
    };
  }
  return { safe: true };
}
