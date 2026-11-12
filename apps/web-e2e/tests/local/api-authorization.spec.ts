import type { APIRequestContext } from '@playwright/test';
import { expect, test } from './helpers/fixtures';
import { apiRoutes, routeKey, unmatchedPath, type ApiRoute } from './helpers/api-routes';
import type { SessionKey } from './helpers/sessions';

/**
 * Authorization for EVERY route the API registers, for every role and for a
 * visitor with no session (AGENTS.md #4: never trust frontend authorization).
 *
 * The route list comes from the API's own decorator metadata, so a new route
 * is checked the day it is added. What each role may do is written here once,
 * as the product's intent, and the test asks the running API whether it
 * agrees. A route that declares a permission but does not enforce it, or
 * that was added with no guard at all, fails here.
 *
 * Calls use ids that match nothing and bodies that fail validation, so an
 * allowed call ends in 400 or 404 and the mock ward does not change.
 */

/** Seeded role → permissions (packages/database/prisma/seed.ts). */
const WARD_ADMIN = [
  'directory.read',
  'directory.write',
  'audiences.read',
  'audiences.manage',
  'destinations.manage',
  'campaigns.create',
  'campaigns.approve',
  'campaigns.send',
  'audit.read',
  'users.manage',
  'roles.manage',
  'ward.manage',
  'units.manage',
];
const ROLE_PERMISSIONS: Record<SessionKey, string[]> = {
  superadmin: ['platform.wards.manage'],
  districtAdmin: WARD_ADMIN,
  stakeAdmin: WARD_ADMIN,
  wardAdmin: WARD_ADMIN,
  otherWardAdmin: WARD_ADMIN,
  coordinator: [
    'directory.read',
    'audiences.read',
    'audiences.manage',
    'destinations.manage',
    'campaigns.create',
    'campaigns.approve',
    'campaigns.send',
    'audit.read',
  ],
  contributor: ['directory.read', 'directory.write', 'audiences.read', 'campaigns.create'],
  viewer: ['directory.read'],
};
const ROLES = Object.keys(ROLE_PERMISSIONS) as SessionKey[];

/** Routes meant to answer with no session. Anything else unguarded is a bug. */
const PUBLIC_ROUTES = new Set([
  'GET /health',
  'POST /auth/login',
  'POST /auth/totp',
  'POST /auth/ward-code',
  'POST /auth/refresh',
  'POST /auth/forgot-password',
  'POST /auth/reset-password',
  'POST /auth/verify-email',
  'GET /public/wards/:slug/bulletins',
  'GET /public/wards/:slug/bulletins/:id',
  'GET /public/wards/:slug/campaigns',
]);

/**
 * Routes where a permitted caller changes real state even with an empty
 * body (sign out, rotate a code, start a draft). For these the test still
 * proves who is REFUSED; the permitted path is exercised by the named spec.
 */
const PERMITTED_CALL_COVERED_ELSEWHERE: Record<string, string> = {
  'POST /auth/logout': 'auth.spec.ts',
  'POST /auth/totp/enroll': 'auth.spec.ts',
  'POST /auth/totp/disable': 'auth.spec.ts',
  'POST /auth/verification-email': 'settings.spec.ts',
  'POST /ward/code/rotate': 'admin.spec.ts',
  'POST /bulletins': 'bulletins.spec.ts',
};

function isPublic(route: ApiRoute): boolean {
  return !route.guards.includes('SessionAuthGuard');
}

function mayCall(role: SessionKey, route: ApiRoute): boolean {
  if (route.permissions.length === 0) return true;
  return route.permissions.some((permission) => ROLE_PERMISSIONS[role].includes(permission));
}

interface Answer {
  status: number;
  /** True when the permission guard refused the call (not an ownership check further in). */
  missingPermission: boolean;
}

async function call(api: APIRequestContext, route: ApiRoute): Promise<Answer> {
  const url = unmatchedPath(route.path);
  const options =
    route.method === 'GET' || route.method === 'DELETE'
      ? { maxRedirects: 0 }
      : { maxRedirects: 0, data: { fictionalInvalidField: true } };
  const method = route.method.toLowerCase() as 'get' | 'post' | 'put' | 'patch' | 'delete';
  const response = await api[method](url, options);
  const status = response.status();
  const missingPermission =
    status === 403 && (await response.text()).includes('Missing required permission');
  return { status, missingPermission };
}

test.describe('Every API route: authorization', () => {
  test('the route list is complete enough to trust', () => {
    const routes = apiRoutes();
    expect(routes.length).toBeGreaterThan(100);
    expect(new Set(routes.map(routeKey)).size).toBe(routes.length);
  });

  test('only the intended routes answer without a session', () => {
    const unguarded = apiRoutes().filter(isPublic).map(routeKey).sort();
    expect(unguarded).toEqual([...PUBLIC_ROUTES].sort());
  });

  test('every guarded route that checks a permission also runs the permission guard', () => {
    const missing = apiRoutes()
      .filter((route) => route.permissions.length > 0 && !route.guards.includes('PermissionsGuard'))
      .map(routeKey);
    expect(missing).toEqual([]);
  });

  test('every permission a route asks for is one a seeded role can hold', () => {
    const known = new Set(Object.values(ROLE_PERMISSIONS).flat());
    const unknown = apiRoutes()
      .flatMap((route) =>
        route.permissions.map((permission) => `${routeKey(route)}: ${permission}`),
      )
      .filter((entry) => !known.has(entry.split(': ')[1] ?? ''));
    expect(unknown).toEqual([]);
  });

  test('a visitor with no session is refused by every guarded route', async ({ anonymousApi }) => {
    const problems: string[] = [];
    for (const route of apiRoutes().filter((candidate) => !isPublic(candidate))) {
      const { status } = await call(anonymousApi, route);
      if (status !== 401) problems.push(`${routeKey(route)} → ${status}, expected 401`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  for (const role of ROLES) {
    test(`${role}: refused exactly where the role lacks the permission`, async ({ api }) => {
      const client = await api(role);
      const problems: string[] = [];
      for (const route of apiRoutes().filter((candidate) => !isPublic(candidate))) {
        const key = routeKey(route);
        const permitted = mayCall(role, route);
        if (permitted && key in PERMITTED_CALL_COVERED_ELSEWHERE) continue;
        const { status, missingPermission } = await call(client, route);
        // A 403 without "Missing required permission" is an ownership check on the
        // unmatched id (for example someone else's session), which is correct.
        if (permitted && (status === 401 || missingPermission)) {
          problems.push(`${key} → ${status}, expected access`);
        }
        if (permitted && status >= 500) problems.push(`${key} → ${status}, the API crashed`);
        if (permitted && route.method !== 'GET' && status < 300) {
          problems.push(`${key} → ${status}, a junk request was accepted`);
        }
        if (!permitted && status !== 403) problems.push(`${key} → ${status}, expected 403`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  test('the public routes answer a visitor without crashing', async ({ anonymousApi }) => {
    const problems: string[] = [];
    for (const route of apiRoutes().filter(isPublic)) {
      const { status } = await call(anonymousApi, route);
      if (status === 403 || status >= 500) problems.push(`${routeKey(route)} → ${status}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});
