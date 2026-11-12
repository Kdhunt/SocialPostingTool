import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from '../../../mock-ward/env';

/** One HTTP route as the API declares it (see apps/api/scripts/list-routes.ts). */
export interface ApiRoute {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  controller: string;
  handler: string;
  guards: string[];
  permissions: string[];
}

let cached: ApiRoute[] | null = null;

/**
 * Every route the API registers, read from its decorator metadata. A route
 * added to any controller shows up here without anyone editing a test.
 */
export function apiRoutes(): ApiRoute[] {
  if (cached) return cached;
  const output = execFileSync('pnpm', ['exec', 'tsx', 'scripts/list-routes.ts'], {
    cwd: path.join(repoRoot, 'apps', 'api'),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  cached = JSON.parse(output) as ApiRoute[];
  return cached;
}

export function routeKey(route: Pick<ApiRoute, 'method' | 'path'>): string {
  return `${route.method} ${route.path}`;
}

const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Fills path parameters with values that match nothing, so a call that gets
 * past authorization ends in 404 or 400 and changes nothing.
 */
export function unmatchedPath(routePath: string): string {
  return routePath.replace(/:([A-Za-z]+)/g, (_match, name: string) => {
    if (name === 'slug') return 'no-such-fictional-ward';
    if (name === 'channel') return 'Email';
    return NO_SUCH_ID;
  });
}
