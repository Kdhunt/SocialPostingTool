/**
 * How a sign-in request chooses a tenant.
 *
 * Ward clerks identify their ward with the public page path (not the
 * hashed ward code). Platform operators omit the path so the same
 * username can exist on many wards without colliding with superadmin.
 */

export type LoginTenantSelection =
  | { kind: 'platform' }
  | { kind: 'ward'; slug: string };

export function selectLoginTenant(wardSlug: string | undefined | null): LoginTenantSelection {
  const slug = (wardSlug ?? '').trim().toLowerCase();
  if (slug.length === 0) {
    return { kind: 'platform' };
  }
  return { kind: 'ward', slug };
}
