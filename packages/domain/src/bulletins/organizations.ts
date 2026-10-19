/**
 * Organizations every unit starts with. Bulletin sections are filed under
 * one, and units can rename, add or archive their own afterwards.
 * The migration 20261019000000_bulletins backfills the same list.
 */
export const DEFAULT_UNIT_ORGANIZATIONS: readonly string[] = [
  'General',
  'Relief Society',
  'Priesthood',
  'Young Women',
  'Youth',
  'Primary',
];

export const UNIT_ORGANIZATION_NAME_MAX_LENGTH = 80;

/** Trims and collapses whitespace; returns null when nothing is left. */
export function normalizeOrganizationName(name: string): string | null {
  const normalized = name.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0 || normalized.length > UNIT_ORGANIZATION_NAME_MAX_LENGTH) {
    return null;
  }
  return normalized;
}

/** Case-insensitive comparison so "Primary" and "primary" count as the same organization. */
export function sameOrganizationName(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}
