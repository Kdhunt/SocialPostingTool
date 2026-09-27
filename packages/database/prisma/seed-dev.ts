/**
 * Development-only seed: creates a fictional ward, ward clerk, and
 * active ward code for local sign-in. Idempotent — safe to re-run.
 * Does not create PlatformAdmin; that account comes from BOOTSTRAP_*.
 *
 * Requires `pnpm db:seed` (roles/permissions catalog) first and a migrated DB.
 * NEVER run against production data.
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const DEV_WARD_NAME = 'Fictional Dev Ward';
const DEV_USERNAME = 'admin';
const DEV_EMAIL = 'admin@example.com';
const DEV_PASSWORD = 'ChangeMeNow!23';
const DEV_WARD_CODE = 'WARD-DEV-CODE';
const DEV_DISPLAY_NAME = 'Dev Ward Admin';
const PLATFORM_ADMIN_ROLE = 'PlatformAdmin';

function withPepper(wardCode: string): string {
  const pepper = process.env.WARD_CODE_PEPPER;
  if (!pepper || pepper.length < 16) {
    throw new Error('WARD_CODE_PEPPER must be set (min 16 chars) before running db:seed:dev.');
  }
  return `${wardCode}:${pepper}`;
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('seed-dev must not run in production.');
  }

  let ward = await prisma.ward.findFirst({ where: { name: DEV_WARD_NAME, archivedAt: null } });
  if (!ward) {
    ward = await prisma.ward.create({
      data: {
        name: DEV_WARD_NAME,
        publicSlug: 'fictionaldevward',
        timeZone: process.env.WARD_TIME_ZONE ?? 'America/Denver',
      },
    });
  }

  const wardAdminRole = await prisma.role.findUnique({ where: { name: 'WardAdmin' } });
  if (!wardAdminRole) {
    throw new Error('WardAdmin role not found — run `pnpm db:seed` first.');
  }

  const platformAdminRole = await prisma.role.findUnique({ where: { name: PLATFORM_ADMIN_ROLE } });
  if (!platformAdminRole) {
    throw new Error('PlatformAdmin role not found — run `pnpm db:seed` first.');
  }

  const passwordHash = await hash(DEV_PASSWORD);
  let user = await prisma.applicationUser.findFirst({
    where: { wardId: ward.id, username: DEV_USERNAME, archivedAt: null },
  });
  if (!user) {
    user = await prisma.applicationUser.create({
      data: {
        wardId: ward.id,
        username: DEV_USERNAME,
        email: DEV_EMAIL,
        displayName: DEV_DISPLAY_NAME,
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
    });
  } else {
    await prisma.applicationUser.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordUpdatedAt: new Date(),
        disabledAt: null,
        email: user.email ?? DEV_EMAIL,
      },
    });
  }

  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: user.id, roleId: wardAdminRole.id } },
    update: {},
    create: { userId: user.id, roleId: wardAdminRole.id },
  });

  // Superadmin is only the ENV-bootstrapped PlatformAdmin. This ward clerk
  // must not also hold that role (re-runs strip a leftover assignment).
  await prisma.userRole.deleteMany({
    where: { userId: user.id, roleId: platformAdminRole.id },
  });

  const activeCode = await prisma.wardCodeVersion.findFirst({
    where: { wardId: ward.id, retiredAt: null },
    orderBy: { version: 'desc' },
  });
  if (!activeCode) {
    const codeHash = await hash(withPepper(DEV_WARD_CODE));
    await prisma.wardCodeVersion.create({
      data: { wardId: ward.id, version: 1, codeHash, activatedAt: new Date() },
    });
  }

  const bootstrapUsername = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  console.log('');
  console.log('=== Ward Communications Hub — dev credentials (fictional) ===');
  console.log(`Ward:      ${DEV_WARD_NAME}`);
  console.log(`Username:  ${DEV_USERNAME}`);
  console.log(`Password:  ${DEV_PASSWORD}`);
  console.log(`Ward code: ${DEV_WARD_CODE}`);
  console.log(`Page path: fictionaldevward`);
  console.log('Sign in at http://localhost:3000/login with the ward page path filled in.');
  if (bootstrapUsername) {
    console.log(
      `Superadmin is ${bootstrapUsername} from BOOTSTRAP_* (leave the ward page path blank). Run pnpm db:bootstrap if that account does not exist yet.`,
    );
  } else {
    console.log(
      'Superadmin is the BOOTSTRAP_* user (leave the ward page path blank). Set those env vars and run pnpm db:bootstrap.',
    );
  }
  console.log('=============================================================');
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error('seed-dev failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
