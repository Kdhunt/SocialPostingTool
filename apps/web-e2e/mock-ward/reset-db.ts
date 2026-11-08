/**
 * Drops and recreates the disposable e2e database, then loads the role
 * catalog and the bootstrap superadmin. Runs before the API starts.
 *
 *   pnpm --filter @ward-comms/web-e2e exec tsx mock-ward/reset-db.ts
 *
 * Guarded: only a local database whose name contains "e2e" or "test".
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { applyLocalE2eEnv, assertDisposableDatabase, repoRoot } from './env';

const env = applyLocalE2eEnv();
assertDisposableDatabase(env.DATABASE_URL);

const databasePackage = path.join(repoRoot, 'packages', 'database');

function run(args: string[]): void {
  execFileSync('pnpm', ['exec', ...args], { cwd: databasePackage, env, stdio: 'inherit' });
}

run(['prisma', 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate']);
run(['tsx', 'prisma/seed.ts']);
run(['tsx', 'prisma/seed-bootstrap.ts']);
console.log('Mock-ward database reset complete.');
