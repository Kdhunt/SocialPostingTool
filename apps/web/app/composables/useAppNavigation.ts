import { computed } from 'vue';
import { isPlatformOperatorView } from '@ward-comms/domain';
import { canUse, type PageArea } from '~/utils/permissions';

export interface NavItem {
  label: string;
  to: string;
  permission?: string;
  matchPrefix?: string;
  isActive?: (path: string) => boolean;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavItem[];
}

export function useAppNavigation(): {
  sections: import('vue').ComputedRef<NavSection[]>;
  adminItems: import('vue').ComputedRef<NavItem[]>;
  hasPermission: (key: string) => boolean;
  /** Whether the signed-in user may use an area of the app (see utils/permissions). */
  canUseArea: (area: PageArea) => boolean;
  isPlatformOperator: import('vue').ComputedRef<boolean>;
} {
  const { state: authState } = useAuth();

  function permissionKeys(): string[] {
    if (authState.value.kind !== 'authenticated') {
      return [];
    }
    return authState.value.user.permissions;
  }

  /** The signed-in user's unit level; older sessions without it are treated as a ward. */
  function unitLevel(): 'Ward' | 'Stake' | 'Region' | 'District' {
    return authState.value.kind === 'authenticated' ? (authState.value.user.unitLevel ?? 'Ward') : 'Ward';
  }

  function hasPermission(key: string): boolean {
    return permissionKeys().includes(key);
  }

  const isPlatformOperator = computed(() => isPlatformOperatorView(permissionKeys()));

  const sections = computed<NavSection[]>(() => {
    const account: NavSection = {
      id: 'account',
      label: 'Account',
      items: [
        { label: 'Account', to: '/settings/account', matchPrefix: '/settings/account' },
        { label: 'Security', to: '/settings/security', matchPrefix: '/settings/security' },
      ],
    };
    const overview: NavSection = {
      id: 'overview',
      label: 'Overview',
      items: [{ label: 'Home', to: '/', matchPrefix: '/' }],
    };

    if (isPlatformOperator.value) {
      return [account, overview];
    }

    const can = (area: PageArea): boolean => canUse(permissionKeys(), area);
    const people: NavItem[] = can('directory')
      ? [
          {
            label: 'People',
            to: '/directory',
            isActive: (path) => path === '/directory' || path.startsWith('/directory/people'),
          },
          { label: 'Households', to: '/directory/households', matchPrefix: '/directory/households' },
        ]
      : [];
    const messaging: NavItem[] = [
      ...(can('campaigns') ? [{ label: 'Campaigns', to: '/campaigns', matchPrefix: '/campaigns' }] : []),
      ...(can('bulletins') ? [{ label: 'Bulletins', to: '/bulletins', matchPrefix: '/bulletins' }] : []),
      ...(can('audiences')
        ? [
            {
              label: 'Audiences',
              to: '/audiences',
              isActive: (path: string) =>
                path === '/audiences' || (path.startsWith('/audiences/') && !path.startsWith('/audiences/destinations')),
            },
            { label: 'Destinations', to: '/audiences/destinations', matchPrefix: '/audiences/destinations' },
          ]
        : []),
    ];

    return [
      account,
      overview,
      ...(people.length > 0 ? [{ id: 'people', label: 'People', items: people }] : []),
      ...(messaging.length > 0 ? [{ id: 'messaging', label: 'Messaging', items: messaging }] : []),
    ];
  });

  const adminItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [];
    if (isPlatformOperator.value) {
      items.push({
        label: 'Units',
        to: '/admin/wards',
        permission: 'platform.wards.manage',
        matchPrefix: '/admin/wards',
      });
      return items;
    }
    if (hasPermission('users.manage')) {
      items.push({ label: 'Users', to: '/admin/users', permission: 'users.manage', matchPrefix: '/admin/users' });
    }
    if (hasPermission('units.manage') && unitLevel() !== 'Ward') {
      items.push({ label: 'Units', to: '/admin/units', permission: 'units.manage', matchPrefix: '/admin/units' });
    }
    if (hasPermission('ward.manage')) {
      items.push({
        label: `${unitLevel()} code`,
        to: '/admin/ward-code',
        permission: 'ward.manage',
        matchPrefix: '/admin/ward-code',
      });
    }
    if (hasPermission('ward.manage')) {
      items.push({
        label: 'Organizations',
        to: '/admin/organizations',
        permission: 'ward.manage',
        matchPrefix: '/admin/organizations',
      });
    }
    if (hasPermission('campaigns.send')) {
      items.push({
        label: 'Providers',
        to: '/admin/provider-credentials',
        permission: 'campaigns.send',
        matchPrefix: '/admin/provider-credentials',
      });
      items.push({
        label: 'Facebook Page',
        to: '/admin/facebook-page',
        permission: 'campaigns.send',
        matchPrefix: '/admin/facebook-page',
      });
    }
    if (hasPermission('audit.read')) {
      items.push({ label: 'Audit log', to: '/admin/audit', permission: 'audit.read', matchPrefix: '/admin/audit' });
    }
    return items;
  });

  function canUseArea(area: PageArea): boolean {
    return canUse(permissionKeys(), area);
  }

  return { sections, adminItems, hasPermission, canUseArea, isPlatformOperator };
}

export function isNavItemActive(path: string, item: NavItem): boolean {
  if (item.isActive) {
    return item.isActive(path);
  }

  const prefix = item.matchPrefix ?? item.to;
  if (prefix === '/') {
    return path === '/';
  }
  return path === prefix || path.startsWith(`${prefix}/`);
}
