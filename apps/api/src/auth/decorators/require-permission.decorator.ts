import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Marks a route as requiring a permission key, or any one of several
 * permission keys (see packages/database/prisma/seed.ts for the
 * permission catalog) — e.g. a campaign can be viewed by whoever may
 * either draft or approve it. Must be combined with
 * `@UseGuards(SessionAuthGuard, PermissionsGuard)` — this decorator only
 * attaches metadata, it does not itself enforce anything (see
 * .cursor/rules/security.mdc: "apply server side role and permission
 * checks to every protected route").
 */
export function RequirePermission(permissionKey: string | string[]): ReturnType<typeof SetMetadata> {
  return SetMetadata(REQUIRE_PERMISSION_KEY, Array.isArray(permissionKey) ? permissionKey : [permissionKey]);
}
