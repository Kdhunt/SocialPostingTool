export const FALLBACK_FUNCTION_NAME = '__fallback';
export const FALLBACK_DEST = `/${FALLBACK_FUNCTION_NAME}`;

/** Nitro writes `functions/<name>.func`. Ignore nested copies traced into those bundles. */
export function functionNameFromFuncEntry(relativePath: string): string | undefined {
  const normalized = relativePath.replaceAll('\\', '/');
  if (!normalized.endsWith('.func')) {
    return undefined;
  }
  const name = normalized.slice(0, -'.func'.length);
  if (name.length === 0 || name.includes('.func/')) {
    return undefined;
  }
  return name;
}

export const API_ROUTES: Array<Record<string, string>> = [
  { src: '/api/v1/(.*)', dest: '/api/nest' },
  { src: '/api/cron/process-schedules', dest: '/api/cron/process-schedules' },
  { src: '/api/cron/process-delivery-queue', dest: '/api/cron/process-delivery-queue' },
];

export function functionNameFromDest(dest: string): string {
  return dest.split('?')[0]?.replace(/^\//, '') ?? '';
}

/**
 * Nitro observability aliases (`__nuxt_error.func`, `login.func`, …) are
 * symlinks to `__fallback.func`. Vercel `readlink`s them and looks up the
 * target with `.func` stripped. Absolute link targets become
 * `…/functions/__fallback`, which is not in the Lambda map (keyed
 * `__fallback` from `__fallback.func`), so deploy fails:
 * "Could not find target …/functions/__fallback … for path __nuxt_error".
 *
 * Routes are remapped to `/__fallback`; delete these symlink dirs so Vercel
 * never tries to resolve them.
 */
export function isObservabilityFunctionSymlink(
  relativePath: string,
  isSymbolicLink: boolean,
): boolean {
  return isSymbolicLink && functionNameFromFuncEntry(relativePath) !== undefined;
}

/**
 * Nitro observability routes dest to names like `/index` and `/login`, and
 * creates those as symlinks to `__fallback.func`. Vercel does not deploy
 * those symlinks, so the dest 404s. Point missing dests at `__fallback`.
 */
export function remapRoutesToExistingFunctions(
  routes: Array<Record<string, string>>,
  existingFunctions: ReadonlySet<string>,
  fallbackDest: string = FALLBACK_DEST,
): Array<Record<string, string>> {
  const fallbackName = functionNameFromDest(fallbackDest);
  if (!existingFunctions.has(fallbackName)) {
    throw new Error(`Fallback function "${fallbackName}" is missing from Build Output`);
  }

  return routes.map((route) => {
    if (!route.dest) {
      return route;
    }
    const name = functionNameFromDest(route.dest);
    if (existingFunctions.has(name)) {
      return route;
    }
    return { ...route, dest: fallbackDest };
  });
}

/** Place API routes after static filesystem handling and before page dests. */
export function insertApiRoutes(
  routes: Array<Record<string, string>>,
  apiRoutes: Array<Record<string, string>> = API_ROUTES,
): Array<Record<string, string>> {
  const filesystemIndex = routes.findIndex((route) => route.handle === 'filesystem');
  const fallbackIndex = routes.findIndex(
    (route) => route.src === '/(.*)' && route.dest === FALLBACK_DEST,
  );
  const insertAt =
    filesystemIndex !== -1
      ? filesystemIndex + 1
      : fallbackIndex === -1
        ? routes.length
        : fallbackIndex;
  const next = [...routes];
  next.splice(insertAt, 0, ...apiRoutes);
  return next;
}
