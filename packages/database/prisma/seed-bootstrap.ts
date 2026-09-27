/**
 * Production bootstrap: creates the first ward and the single PlatformAdmin
 * (superadmin) when BOOTSTRAP_* environment variables are set. Idempotent —
 * skips when a PlatformAdmin already exists. Superadmin sign-in is
 * ward-agnostic (no page path, no ward code).
 *
 * Used by Vercel builds (see scripts/vercel-build.ts) and can be run manually:
 *
 *   DATABASE_URL=... WARD_CODE_PEPPER=... BOOTSTRAP_ADMIN_USERNAME=... \\
 *     pnpm --filter @ward-comms/database db:bootstrap
 */
import { hash } from '@node-rs/argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function publicSlugFromName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 64);
  return slug.length >= 2 ? slug : 'ward';
}

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
  const adminUsername = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  if (!adminUsername) {
    console.log('Bootstrap skipped: BOOTSTRAP_ADMIN_USERNAME is not set.');
    return;
  }
  const adminPassword = requireEnv('BOOTSTRAP_ADMIN_PASSWORD');
  const wardCode = requireEnv('BOOTSTRAP_WARD_CODE');
  const wardName = process.env.BOOTSTRAP_WARD_NAME?.trim() || 'Ward Communications Hub';
  const adminDisplayName = process.env.BOOTSTRAP_ADMIN_DISPLAY_NAME?.trim() || adminUsername;
  const timeZone = process.env.WARD_TIME_ZONE?.trim() || 'America/Denver';
  // Same plausible-email rule as packages/domain normalizeEmail (this
  // package does not depend on domain; bootstrap is a one-shot seed).
  const adminEmailRaw = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  if (adminEmailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmailRaw)) {
    throw new Error('BOOTSTRAP_ADMIN_EMAIL must be a valid email address.');
  }
  const adminEmail = adminEmailRaw || null;

  if (adminPassword.length < 12) {
    throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters.');
  }
  if (wardCode.length < 4) {
    throw new Error('BOOTSTRAP_WARD_CODE must be at least 4 characters.');
  }

  const platformAdminRole = await prisma.role.findUnique({ where: { name: 'PlatformAdmin' } });
  const wardAdminRole = await prisma.role.findUnique({ where: { name: 'WardAdmin' } });
  if (!wardAdminRole || !platformAdminRole) {
    throw new Error('Roles not found — run `pnpm --filter @ward-comms/database db:seed` first.');
  }

  const existingOperators = await prisma.applicationUser.findMany({
    where: {
      archivedAt: null,
      roles: { some: { roleId: platformAdminRole.id } },
    },
    select: { id: true, username: true },
  });
  if (existingOperators.length > 1) {
    throw new Error(
      `Bootstrap refused: ${existingOperators.length} PlatformAdmin accounts exist. Keep only the BOOTSTRAP_* superadmin.`,
    );
  }
  if (existingOperators.length === 1) {
    const existing = existingOperators[0];
    await prisma.userRole.deleteMany({
      where: { userId: existing?.id, roleId: wardAdminRole.id },
    });
    console.log(
      `Bootstrap skipped: PlatformAdmin "${existing?.username ?? 'unknown'}" already exists. There is only one superadmin.`,
    );
    return;
  }

  const passwordHash = await hash(adminPassword);
  const codeHash = await hash(withPepper(wardCode));

  await prisma.$transaction(async (tx) => {
    let ward = await tx.ward.findFirst({ where: { name: wardName, archivedAt: null } });
    if (!ward) {
      ward = await tx.ward.create({
        data: { name: wardName, timeZone, publicSlug: publicSlugFromName(wardName) },
      });
    }

    const adminUser =
      (await tx.applicationUser.findFirst({
        where: { wardId: ward.id, username: adminUsername, archivedAt: null },
      })) ??
      (await tx.applicationUser.create({
        data: {
          wardId: ward.id,
          username: adminUsername,
          email: adminEmail,
          displayName: adminDisplayName,
          passwordHash,
          passwordUpdatedAt: new Date(),
        },
      }));

    await tx.userRole.createMany({
      data: [{ userId: adminUser.id, roleId: platformAdminRole.id }],
      skipDuplicates: true,
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
  console.log('Sign in at /login with the bootstrap username and password.');
  console.log('Leave the ward page path blank — PlatformAdmin does not use a ward code.');
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
