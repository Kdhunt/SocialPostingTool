// Overlap content resolution when a person belongs to multiple campaign audiences.
//
// AGENTS.md #7 requires visibility into overlapping audiences; this module
// picks which audience's override content applies per person based on an
// explicit strategy instead of silently using first-wins everywhere.

export const OVERLAP_RESOLUTION_STRATEGIES = ['FirstAudienceWins', 'PreferBase', 'PreferSpecificAudience'] as const;
export type OverlapResolutionStrategy = (typeof OVERLAP_RESOLUTION_STRATEGIES)[number];

export interface OverlapResolutionInput {
  /** Audience group ids in campaign selection order (first = highest priority for FirstAudienceWins). */
  audienceGroupIdsInOrder: string[];
  /** The audiences this person belongs to among the campaign selection. */
  personAudienceGroupIds: string[];
  strategy: OverlapResolutionStrategy;
  /** Required when strategy is PreferSpecificAudience. */
  preferSpecificAudienceGroupId?: string | null;
}

export interface OverlapResolutionResult {
  /** null when PreferBase — use campaign base content for this person. */
  winningAudienceGroupId: string | null;
  usesBaseContent: boolean;
}

/**
 * Resolves which audience override applies to one overlapping person.
 * Non-overlapping people always use their single audience.
 */
export function resolveOverlapForPerson(input: OverlapResolutionInput): OverlapResolutionResult {
  const { audienceGroupIdsInOrder, personAudienceGroupIds, strategy, preferSpecificAudienceGroupId } = input;

  if (personAudienceGroupIds.length <= 1) {
    return {
      winningAudienceGroupId: personAudienceGroupIds[0] ?? null,
      usesBaseContent: false,
    };
  }

  switch (strategy) {
    case 'PreferBase':
      return { winningAudienceGroupId: null, usesBaseContent: true };

    case 'PreferSpecificAudience': {
      if (
        preferSpecificAudienceGroupId &&
        personAudienceGroupIds.includes(preferSpecificAudienceGroupId)
      ) {
        return { winningAudienceGroupId: preferSpecificAudienceGroupId, usesBaseContent: false };
      }
      const firstInOrder = audienceGroupIdsInOrder.find((id) => personAudienceGroupIds.includes(id)) ?? null;
      return { winningAudienceGroupId: firstInOrder, usesBaseContent: false };
    }

    case 'FirstAudienceWins':
    default: {
      const winner = audienceGroupIdsInOrder.find((id) => personAudienceGroupIds.includes(id)) ?? null;
      return { winningAudienceGroupId: winner, usesBaseContent: false };
    }
  }
}

export interface OverlapConflict {
  personId: string;
  audienceGroupIds: string[];
  winningAudienceGroupId: string | null;
  usesBaseContent: boolean;
}

/** Builds conflict rows for every person in more than one selected audience. */
export function buildOverlapConflicts(
  mergedPeople: { personId: string; audienceGroupIds: string[] }[],
  audienceGroupIdsInOrder: string[],
  strategy: OverlapResolutionStrategy,
  preferSpecificAudienceGroupId?: string | null,
): OverlapConflict[] {
  return mergedPeople
    .filter((person) => person.audienceGroupIds.length > 1)
    .map((person) => {
      const resolution = resolveOverlapForPerson({
        audienceGroupIdsInOrder,
        personAudienceGroupIds: person.audienceGroupIds,
        strategy,
        preferSpecificAudienceGroupId,
      });
      return {
        personId: person.personId,
        audienceGroupIds: person.audienceGroupIds,
        winningAudienceGroupId: resolution.winningAudienceGroupId,
        usesBaseContent: resolution.usesBaseContent,
      };
    });
}
