// Audience overlap and duplicate-membership detection.
//
// AGENTS.md #7 ("Never silently send duplicate messages to overlapping
// audiences") requires that when multiple audiences are combined (e.g.
// for a campaign in a later phase), a person who belongs to more than one
// of them is represented exactly once, with visibility into which
// audiences they came from — never sent to twice without anyone knowing
// why. These are pure, side-effect-free helpers so this logic can be
// tested and reused wherever audiences are combined.

export interface AudienceMembershipSet {
  audienceGroupId: string;
  personIds: string[];
}

export interface DeduplicatedPerson {
  personId: string;
  audienceGroupIds: string[];
}

/**
 * Merges membership lists from one or more audiences into a deduplicated
 * list of people, each annotated with every audience they belong to
 * among the ones provided. A person appearing in three of five combined
 * audiences appears exactly once, with all three audience ids recorded.
 */
export function mergeAudienceMemberships(sets: AudienceMembershipSet[]): DeduplicatedPerson[] {
  const byPerson = new Map<string, Set<string>>();

  for (const set of sets) {
    for (const personId of set.personIds) {
      const audienceIds = byPerson.get(personId) ?? new Set<string>();
      audienceIds.add(set.audienceGroupId);
      byPerson.set(personId, audienceIds);
    }
  }

  return [...byPerson.entries()].map(([personId, audienceGroupIds]) => ({
    personId,
    audienceGroupIds: [...audienceGroupIds],
  }));
}

/** People who appear in more than one of the combined audiences. */
export function findOverlappingPeople(sets: AudienceMembershipSet[]): DeduplicatedPerson[] {
  return mergeAudienceMemberships(sets).filter((person) => person.audienceGroupIds.length > 1);
}

/**
 * Whether adding `personId` to an audience that already has
 * `existingMemberPersonIds` would be a duplicate. The database's unique
 * constraint is the final backstop, but the application layer should
 * check this first so it can return a clear, specific error rather than
 * a raw constraint-violation failure.
 */
export function isDuplicateMembership(existingMemberPersonIds: string[], personId: string): boolean {
  return existingMemberPersonIds.includes(personId);
}
