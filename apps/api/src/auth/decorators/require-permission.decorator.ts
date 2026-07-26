import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PERMISSION_KEY = 'requirePermission';

/**
 * Marks a route as requiring a specific permission key (see
 * packages/database/prisma/seed.ts for the permission catalog). Must be
 * combined with `@UseGuards(SessionAuthGuard, PermissionsGuard)` — this
 * decorator only attaches metadata, it does not itself enforce anything
 * (see .cursor/rules/security.mdc: "apply server side role and permission
 * checks to every protected route").
 */
export function RequirePermission(permissionKey: string): ReturnType<typeof SetMetadata> {
  return SetMetadata(REQUIRE_PERMISSION_KEY, permissionKey);
}
