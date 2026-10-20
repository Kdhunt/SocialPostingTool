/**
 * How a sign-in request chooses a tenant.
 *
 * Ward clerks identify their ward with the public page path (not the
 * hashed ward code). Omitting the path is superadmin sign-in: there is
 * exactly one PlatformAdmin, created from BOOTSTRAP_* env credentials.
 * A PlatformAdmin cannot sign in through a ward path — those logins are
 * only for that ward's own accounts.
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

/**
 * Platform login succeeds only when there is exactly one active
 * PlatformAdmin and the submitted username matches that account.
 */
export function pickSolePlatformOperator<T extends { username: string }>(
  operators: T[],
  username: string,
): T | null {
  if (operators.length !== 1) {
    return null;
  }
  const operator = operators[0];
  if (!operator || operator.username !== username) {
    return null;
  }
  return operator;
}

/** Ward-path sign-in is for tenant accounts only, never the superadmin. */
export function allowWardPathLogin(isPlatformAdmin: boolean): boolean {
  return !isPlatformAdmin;
}
