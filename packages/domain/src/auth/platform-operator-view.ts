/**
 * Superadmin (PlatformAdmin) is a platform operator, not a ward clerk.
 * The signed-in shell is platform-only when every granted permission is a
 * `platform.*` key (today: `platform.wards.manage`).
 */

export function isPlatformOperatorView(permissionKeys: string[]): boolean {
  return (
    permissionKeys.includes('platform.wards.manage') &&
    permissionKeys.every((key) => key.startsWith('platform.'))
  );
}
