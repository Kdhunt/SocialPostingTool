import { calculateAgeYears } from '../age.js';
import type { Gender, HouseholdRole } from '../enums.js';
import type { AudienceMembershipRules } from './membership-mode.js';

export interface PersonForRuleEvaluation {
  personId: string;
  gender: Gender;
  dateOfBirth: Date | null;
  /** Active household roles for this person (may belong to multiple households). */
  householdRoles: HouseholdRole[];
  archivedAt: Date | null;
}

/** Whether an active (non-archived) person matches the audience rule set. */
export function personMatchesAudienceRules(
  person: PersonForRuleEvaluation,
  rules: AudienceMembershipRules,
  asOf: Date = new Date(),
): boolean {
  if (person.archivedAt !== null) {
    return false;
  }

  const age = calculateAgeYears(person.dateOfBirth, asOf);

  if (rules.ageMin !== undefined) {
    if (age === null || age < rules.ageMin) {
      return false;
    }
  }

  if (rules.ageMax !== undefined) {
    if (age === null || age > rules.ageMax) {
      return false;
    }
  }

  if (rules.genders !== undefined && rules.genders.length > 0) {
    if (!rules.genders.includes(person.gender)) {
      return false;
    }
  }

  if (rules.householdRoles !== undefined && rules.householdRoles.length > 0) {
    const hasRole = person.householdRoles.some((role) => rules.householdRoles!.includes(role));
    if (!hasRole) {
      return false;
    }
  }

  return true;
}

/** Returns person ids from `candidates` that match `rules`. */
export function findPeopleMatchingRules(
  candidates: PersonForRuleEvaluation[],
  rules: AudienceMembershipRules,
  asOf: Date = new Date(),
): string[] {
  return candidates.filter((person) => personMatchesAudienceRules(person, rules, asOf)).map((person) => person.personId);
}
