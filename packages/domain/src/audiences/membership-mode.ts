// Audience membership mode and rule definitions.
//
// Manual membership is explicit user assignment. Rules mode stores a JSON
// rule set on the audience group; applying rules replaces rule-sourced
// members while manual adds are kept (union). See rule-evaluation.ts.

import type { Gender, HouseholdRole } from '../enums.js';

export const AUDIENCE_MEMBERSHIP_MODES = ['Manual', 'Rules'] as const;
export type AudienceMembershipMode = (typeof AUDIENCE_MEMBERSHIP_MODES)[number];

export const AUDIENCE_MEMBER_SOURCES = ['Manual', 'Rules'] as const;
export type AudienceMemberSource = (typeof AUDIENCE_MEMBER_SOURCES)[number];

/** Simple rule-based membership criteria evaluated against directory people. */
export interface AudienceMembershipRules {
  ageMin?: number;
  ageMax?: number;
  genders?: Gender[];
  householdRoles?: HouseholdRole[];
}

/** Validates rule shape without evaluating people (used at API boundary). */
export function isValidAudienceMembershipRules(value: unknown): value is AudienceMembershipRules {
  if (value === null || typeof value !== 'object') {
    return false;
  }

  const rules = value as Record<string, unknown>;

  if (rules.ageMin !== undefined && (typeof rules.ageMin !== 'number' || rules.ageMin < 0)) {
    return false;
  }
  if (rules.ageMax !== undefined && (typeof rules.ageMax !== 'number' || rules.ageMax < 0)) {
    return false;
  }
  if (rules.ageMin !== undefined && rules.ageMax !== undefined && rules.ageMin > rules.ageMax) {
    return false;
  }

  if (rules.genders !== undefined) {
    if (!Array.isArray(rules.genders) || rules.genders.some((g) => typeof g !== 'string')) {
      return false;
    }
  }

  if (rules.householdRoles !== undefined) {
    if (!Array.isArray(rules.householdRoles) || rules.householdRoles.some((r) => typeof r !== 'string')) {
      return false;
    }
  }

  return true;
}
