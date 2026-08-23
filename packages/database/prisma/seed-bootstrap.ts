/**
 * Production bootstrap: creates the first ward, admin user, and ward code when
 * BOOTSTRAP_* environment variables are set. Idempotent — skips when the
 * bootstrap username already exists.
 *
 * Used by Vercel builds (see scripts/vercel-build.ts) and can be run manually:
 *
 *   DATABASE_URL=... WARD_CODE_PEPPER=... BOOTSTRAP_ADMIN_USERNAME=... \\
 *     pnpm --filter @ward-comms/database db:bootstrap
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for production bootstrap.`);
  }
  return value;
}

function withPepper(wardCode: string): string {
  const pepper = process.env.WARD_CODE_PEPPER;
  if (!pepper || pepper.length < 16) {
    throw new Error('WARD_CODE_PEPPER must be set (min 16 chars) before running db:bootstrap.');
  }
  return `${wardCode}:${pepper}`;
}

async function main(): Promise<void> {
  const adminUsername = requireEnv('BOOTSTRAP_ADMIN_USERNAME');
  const adminPassword = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  const wardCode = requireEnv('BOOTSTRAP_WARD_CODE');
  const wardName = process.env.BOOTSTRAP_WARD_NAME?.trim() || 'Ward Communications Hub';
  const adminDisplayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || adminUsername;
  const timeZone = process.env.WARD_TIME_ZONE?.trim() || 'America/Denver';

  if (adminPassword.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  }
  if (wardCode.length < 4) {
    throw new Error('BOOTSTRAP_WARD_CODE must be at least 4 characters.');
  }

  const existingUser = await prisma.applicationUser.findFirst({
    where: { username: adminUsername, archivedAt: null },
  });
  if (existingUser) {
    console.log(`Bootstrap skipped: user "${adminUsername}" already exists.`);
    return;
  }

  const wardAdminRole = await prisma.role.findUnique({ where: { name: 'WardAdmin' } });
  const platformAdminRole = await prisma.role.findUnique({ where: { name: 'PlatformAdmin' } });
  if (!wardAdminRole || !platformAdminRole) {
    throw new Error('Roles not found — run `pnpm --filter @ward-comms/database db:seed` first.');
  }

  const passwordHash = await hash(adminPassword);
  const codeHash = await hash(withPepper(wardCode));

  await prisma.$transaction(async (tx) => {
    let ward = await tx.ward.findFirst({ where: { name: wardName, archivedAt: null } });
    if (!ward) {
      ward = await tx.ward.create({ data: { name: wardName, timeZone } });
    }

    const adminUser = await tx.applicationUser.create({
      data: {
        wardId: ward.id,
        username: adminUsername,
        displayName: adminDisplayName,
        passwordHash,
        passwordUpdatedAt: new Date(),
      },
    });

    await tx.userRole.createMany({
      data: [
        { userId: adminUser.id, roleId: wardAdminRole.id },
        { userId: adminUser.id, roleId: platformAdminRole.id },
      ],
    });

    const activeCode = await tx.wardCodeVersion.findFirst({
      where: { wardId: ward.id, retiredAt: null },
      orderBy: { version: 'desc' },
    });
    if (!activeCode) {
      await tx.wardCodeVersion.create({
        data: { wardId: ward.id, version: 1, codeHash, activatedAt: new Date() },
      });
    }
  });

  console.log('');
  console.log('=== Production bootstrap complete ===');
  console.log(`Ward:     ${wardName}`);
  console.log(`Username: ${adminUsername}`);
  console.log('Sign in at your deployed /login URL with the bootstrap password and ward code.');
  console.log('Remove BOOTSTRAP_* environment variables after the first successful deploy.');
  console.log('====================================');
  console.log('');
}

main()
  .catch((error: unknown) => {
    console.error('Bootstrap failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
