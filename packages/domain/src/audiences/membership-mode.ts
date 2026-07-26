// Audience membership mode.
//
// Phase 6 only implements manual (explicit, user-assigned) membership.
// This type exists so the application layer already has a stable place
// to branch on membership mode once a rule-based engine (e.g. "everyone
// under 18", "everyone in household X") is added in a later phase,
// without having to introduce a new concept into every call site at that
// point. Do NOT implement rule evaluation yet — phases/06-audiences.md
// explicitly asks to prepare for it, not build it.

export const AUDIENCE_MEMBERSHIP_MODES = ['Manual'] as const;
export type AudienceMembershipMode = (typeof AUDIENCE_MEMBERSHIP_MODES)[number];

/**
 * Placeholder shape for a future rule-based membership definition (e.g.
 * "age between X and Y", "member of household Z"). Intentionally unused
 * by any current logic — it exists only so the eventual rules engine has
 * an agreed extension point to implement against, per
 * phases/06-audiences.md ("prepare the domain ... but do not implement a
 * rules engine yet").
 */
export interface AudienceMembershipRule {
  kind: string;
  parameters: Record<string, unknown>;
}
