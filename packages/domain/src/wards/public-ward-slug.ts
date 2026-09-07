/**
 * Public ward URL slugs (e.g. wardcomms.online/grangecreek).
 *
 * This identifier is **not** the login ward code. Ward codes stay hashed
 * and secret. The slug is a public path so members and visitors can read
 * published campaigns without signing in.
 */

export const PUBLIC_WARD_SLUG_MIN_LENGTH = 2;
export const PUBLIC_WARD_SLUG_MAX_LENGTH = 64;

/**
 * Top-level Nuxt routes and other reserved first path segments. A ward
 * named "Login" must not take over /login.
 */
export const RESERVED_PUBLIC_WARD_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  'assets',
  'audiences',
  'campaigns',
  'directory',
  'favicon',
  'forgot-password',
  'health',
  'index',
  'login',
  'reset-password',
  'robots',
  'settings',
  'sitemap',
  'verify-email',
]);

export function publicWardSlugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, PUBLIC_WARD_SLUG_MAX_LENGTH);
}

export function fallbackPublicWardSlug(uniqueSuffix: string): string {
  const suffix = uniqueSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 16);
  const slug = `ward${suffix}`;
  return slug.slice(0, PUBLIC_WARD_SLUG_MAX_LENGTH);
}

export function normalizePublicWardSlug(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isReservedPublicWardSlug(slug: string): boolean {
  return RESERVED_PUBLIC_WARD_SLUGS.has(normalizePublicWardSlug(slug));
}

export function assertPublicWardSlug(raw: string): string {
  const slug = normalizePublicWardSlug(raw);
  if (slug.length < PUBLIC_WARD_SLUG_MIN_LENGTH || slug.length > PUBLIC_WARD_SLUG_MAX_LENGTH) {
    throw new Error(
      `Public page path must be ${PUBLIC_WARD_SLUG_MIN_LENGTH}–${PUBLIC_WARD_SLUG_MAX_LENGTH} letters or numbers.`,
    );
  }
  if (!/^[a-z0-9]+$/.test(slug)) {
    throw new Error('Public page path may contain only lowercase letters and numbers.');
  }
  if (isReservedPublicWardSlug(slug)) {
    throw new Error('That public page path is reserved. Choose a different path.');
  }
  return slug;
}
