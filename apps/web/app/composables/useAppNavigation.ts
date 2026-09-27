import { computed } from 'vue';
import { isPlatformOperatorView } from '@ward-comms/domain';

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
  isPlatformOperator: import('vue').ComputedRef<boolean>;
} {
  const { state: authState } = useAuth();

  function permissionKeys(): string[] {
    if (authState.value.kind !== 'authenticated') {
      return [];
    }
    return authState.value.user.permissions;
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

    return [
      account,
      overview,
      {
        id: 'people',
        label: 'People',
        items: [
          {
            label: 'People',
            to: '/directory',
            isActive: (path) => path === '/directory' || path.startsWith('/directory/people'),
          },
          {
            label: 'Households',
            to: '/directory/households',
            matchPrefix: '/directory/households',
          },
        ],
      },
      {
        id: 'messaging',
        label: 'Messaging',
        items: [
          { label: 'Campaigns', to: '/campaigns', matchPrefix: '/campaigns' },
          {
            label: 'Audiences',
            to: '/audiences',
            isActive: (path) =>
              path === '/audiences' ||
              (path.startsWith('/audiences/') && !path.startsWith('/audiences/destinations')),
          },
          { label: 'Destinations', to: '/audiences/destinations', matchPrefix: '/audiences/destinations' },
        ],
      },
    ];
  });

  const adminItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [];
    if (isPlatformOperator.value) {
      items.push({
        label: 'Wards',
        to: '/admin/wards',
        permission: 'platform.wards.manage',
        matchPrefix: '/admin/wards',
      });
      return items;
    }
    if (hasPermission('users.manage')) {
      items.push({ label: 'Users', to: '/admin/users', permission: 'users.manage', matchPrefix: '/admin/users' });
    }
    if (hasPermission('ward.manage')) {
      items.push({ label: 'Ward code', to: '/admin/ward-code', permission: 'ward.manage', matchPrefix: '/admin/ward-code' });
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

  return { sections, adminItems, hasPermission, isPlatformOperator };
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
