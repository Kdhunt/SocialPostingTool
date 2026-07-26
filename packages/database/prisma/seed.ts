// Seed data for Ward Communications Hub.
//
// Per phases/03-domain-model.md, seed data is limited to Role and Permission
// records only. No people, households, wards, or audience data is seeded
// here — see AGENTS.md #5 ("Never use production member data in tests")
// and packages/testing for fictional fixtures used by automated tests.
//
// This script is idempotent: re-running it upserts the same roles and
// permissions rather than creating duplicates.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PermissionSeed {
  key: string;
  description: string;
}

interface RoleSeed {
  name: string;
  description: string;
  permissionKeys: string[];
}

/**
 * The full permission catalog. Keys are stable identifiers referenced by
 * authorization checks (added in Phase 4) — do not repurpose an existing
 * key for a different capability.
 */
const permissions: PermissionSeed[] = [
  { key: 'ward.manage', description: 'Manage ward settings and configuration.' },
  { key: 'users.manage', description: 'Create, disable, and manage user accounts.' },
  { key: 'roles.manage', description: 'Assign roles and permissions to users.' },
  { key: 'directory.read', description: 'View the ward directory (people and households).' },
  { key: 'directory.write', description: 'Create and edit people and households.' },
  { key: 'directory.export', description: 'Export or bulk-access directory data.' },
  {
    key: 'minors.contact.read',
    description: 'View contact information for minors. Restricted by design.',
  },
  { key: 'audiences.manage', description: 'Create, edit, and manage audience groups.' },
  { key: 'destinations.manage', description: 'Configure communication destinations.' },
  { key: 'campaigns.create', description: 'Draft and edit communication campaigns.' },
  { key: 'campaigns.approve', description: 'Approve campaigns before they can be sent.' },
  { key: 'campaigns.send', description: 'Send or schedule approved campaigns.' },
  { key: 'audit.read', description: 'View audit log entries.' },
];

const allPermissionKeys: string[] = permissions.map((permission) => permission.key);

/**
 * Illustrative starter roles. These are seed defaults, not a fixed set —
 * wards may add roles later. `minors.contact.read` is intentionally
 * granted only to WardAdmin by default (see AGENTS.md #14).
 */
const roles: RoleSeed[] = [
  {
    name: 'WardAdmin',
    description: 'Full administrative access, including user and role management.',
    permissionKeys: allPermissionKeys,
  },
  {
    name: 'CommunicationsCoordinator',
    description: 'Manages audiences, destinations, and campaign sending.',
    permissionKeys: [
      'directory.read',
      'audiences.manage',
      'destinations.manage',
      'campaigns.create',
      'campaigns.approve',
      'campaigns.send',
      'audit.read',
    ],
  },
  {
    name: 'Contributor',
    description: 'Maintains directory data and drafts campaigns for approval.',
    permissionKeys: ['directory.read', 'directory.write', 'campaigns.create'],
  },
  {
    name: 'Viewer',
    description: 'Read-only access to the ward directory.',
    permissionKeys: ['directory.read'],
  },
];

async function seedPermissions(): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();

  for (const permission of permissions) {
    const record = await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
    keyToId.set(record.key, record.id);
  }

  return keyToId;
}

async function seedRoles(permissionIdsByKey: Map<string, string>): Promise<void> {
  for (const role of roles) {
    const record = await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description, isSystem: true },
      create: { name: role.name, description: role.description, isSystem: true },
    });

    for (const permissionKey of role.permissionKeys) {
      const permissionId = permissionIdsByKey.get(permissionKey);
      if (!permissionId) {
        throw new Error(`Seed error: unknown permission key "${permissionKey}" for role "${role.name}".`);
      }

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: record.id, permissionId } },
        update: {},
        create: { roleId: record.id, permissionId },
      });
    }
  }
}

async function main(): Promise<void> {
  const permissionIdsByKey = await seedPermissions();
  await seedRoles(permissionIdsByKey);

  const roleCount = await prisma.role.count();
  const permissionCount = await prisma.permission.count();
  console.log(`Seeded ${permissionCount} permissions and ${roleCount} roles.`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
