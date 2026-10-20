/**
 * Church unit hierarchy, smallest first: Ward → Stake → Region → District.
 *
 * Every level is a full unit (its own sign-in code, users and data). A unit's
 * parent is always exactly one level above it, and admins of a unit manage
 * every unit beneath it — never siblings, and never anything above.
 */

export const UNIT_LEVELS = ['Ward', 'Stake', 'Region', 'District'] as const;
export type UnitLevel = (typeof UNIT_LEVELS)[number];

export function isUnitLevel(value: unknown): value is UnitLevel {
  return typeof value === 'string' && (UNIT_LEVELS as readonly string[]).includes(value);
}

function rank(level: UnitLevel): number {
  return UNIT_LEVELS.indexOf(level);
}

/** The level a unit's parent must be, or null for the top level. */
export function parentLevelOf(level: UnitLevel): UnitLevel | null {
  return UNIT_LEVELS[rank(level) + 1] ?? null;
}

/** The level of units directly beneath this one, or null for wards. */
export function childLevelOf(level: UnitLevel): UnitLevel | null {
  const index = rank(level) - 1;
  return index >= 0 ? (UNIT_LEVELS[index] ?? null) : null;
}

/** Whether a unit at `parent` level may directly contain a unit at `child` level. */
export function canContain(parent: UnitLevel, child: UnitLevel): boolean {
  return parentLevelOf(child) === parent;
}

/** Lowercase noun for UI copy: "ward", "stake", "region", "district". */
export function unitNoun(level: UnitLevel): string {
  return level.toLowerCase();
}

export interface UnitNode {
  id: string;
  parentId: string | null;
}

/**
 * Whether `ancestorId` is strictly above `unitId`, following parent links
 * through `byId`. Stops at a cycle or a missing link rather than looping.
 */
export function isStrictAncestor(
  ancestorId: string,
  unitId: string,
  byId: ReadonlyMap<string, UnitNode>,
): boolean {
  const seen = new Set<string>([unitId]);
  let current = byId.get(unitId)?.parentId ?? null;
  while (current !== null && !seen.has(current)) {
    if (current === ancestorId) return true;
    seen.add(current);
    current = byId.get(current)?.parentId ?? null;
  }
  return false;
}

/** IDs of every unit beneath `rootId` (not including it), nearest first. */
export function descendantIds(rootId: string, units: readonly UnitNode[]): string[] {
  const childrenByParent = new Map<string, string[]>();
  for (const unit of units) {
    if (unit.parentId === null) continue;
    const list = childrenByParent.get(unit.parentId) ?? [];
    list.push(unit.id);
    childrenByParent.set(unit.parentId, list);
  }
  const result: string[] = [];
  const seen = new Set<string>([rootId]);
  const queue = [...(childrenByParent.get(rootId) ?? [])];
  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    queue.push(...(childrenByParent.get(id) ?? []));
  }
  return result;
}

export type ParentAssignmentProblem = 'wrong_level' | 'self' | 'cycle';

/**
 * Checks placing `unit` under `parent`. Returns null when allowed. A move that
 * would put a unit beneath its own descendant is rejected as a cycle.
 */
export function checkParentAssignment(
  unit: UnitNode & { level: UnitLevel },
  parent: UnitNode & { level: UnitLevel },
  byId: ReadonlyMap<string, UnitNode>,
): ParentAssignmentProblem | null {
  if (unit.id === parent.id) return 'self';
  if (!canContain(parent.level, unit.level)) return 'wrong_level';
  if (isStrictAncestor(unit.id, parent.id, byId)) return 'cycle';
  return null;
}
