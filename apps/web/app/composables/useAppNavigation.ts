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
} {
  const { state: authState } = useAuth();

  function hasPermission(key: string): boolean {
    if (authState.value.kind !== 'authenticated') {
      return false;
    }
    return authState.value.user.permissions.includes(key);
  }

  const sections = computed<NavSection[]>(() => [
    {
      id: 'account',
      label: 'Account',
      items: [{ label: 'Security', to: '/settings/security', matchPrefix: '/settings/security' }],
    },
    {
      id: 'overview',
      label: 'Overview',
      items: [{ label: 'Home', to: '/', matchPrefix: '/' }],
    },
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
  ]);

  const adminItems = computed<NavItem[]>(() => {
    const items: NavItem[] = [];
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
    }
    if (hasPermission('audit.read')) {
      items.push({ label: 'Audit log', to: '/admin/audit', permission: 'audit.read', matchPrefix: '/admin/audit' });
    }
    if (hasPermission('platform.wards.manage')) {
      items.push({
        label: 'Wards',
        to: '/admin/wards',
        permission: 'platform.wards.manage',
        matchPrefix: '/admin/wards',
      });
    }
    return items;
  });

  return { sections, adminItems, hasPermission };
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
