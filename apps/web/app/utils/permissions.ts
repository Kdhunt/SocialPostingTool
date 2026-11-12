/**
 * What each part of the web app needs, mirroring the API's
 * `@RequirePermission` checks. The API is the authority (AGENTS.md #4);
 * these only decide what to offer, so people are not shown pages and
 * buttons that would answer "Missing required permission".
 */
export const PAGE_PERMISSIONS = {
  directory: ['directory.read'],
  directoryWrite: ['directory.write'],
  campaigns: ['campaigns.create', 'campaigns.approve'],
  campaignsCreate: ['campaigns.create'],
  bulletins: ['campaigns.create', 'campaigns.approve', 'campaigns.send'],
  audiences: ['audiences.read'],
  audiencesManage: ['audiences.manage'],
  destinationsManage: ['destinations.manage'],
} as const satisfies Record<string, readonly string[]>;

export type PageArea = keyof typeof PAGE_PERMISSIONS;

/** True when the user holds at least one of the permissions the area needs. */
export function canUse(userPermissions: readonly string[], area: PageArea): boolean {
  return PAGE_PERMISSIONS[area].some((key) => userPermissions.includes(key));
}
