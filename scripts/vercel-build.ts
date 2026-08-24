import {
  ConfigValidationError,
  getMigrationDatabaseUrl,
  getSeedDatabaseUrl,
  loadConfig,
  normalizePlatformEnv,
} from '@ward-comms/config';
import { execSync } from 'node:child_process';
import { assembleVercelOutput } from './vercel-assemble-output.js';

const DEV_PROVIDER_KEY = 'dev-only-provider-credentials-key!!';

function run(command: string, env: Record<string, string | undefined> = process.env): void {
  console.log(`\n> ${command}`);
  execSync(command, { stdio: 'inherit', env: env as NodeJS.ProcessEnv });
}

function printSetupChecklist(): void {
  console.error(`
Vercel production deploy requires:

  Infrastructure (Vercel dashboard — one time):
    • Storage → Postgres → connect to this project
    • Integrations → Upstash Redis → connect to this project

  Secrets (Project → Settings → Environment Variables):
    • SESSION_SECRET          (openssl rand -base64 48)
    • REFRESH_TOKEN_SECRET    (openssl rand -base64 48)
    • WARD_CODE_PEPPER        (≥16 characters)
    • PROVIDER_CREDENTIALS_ENCRYPTION_KEY (openssl rand -base64 32)
    • CRON_SECRET             (openssl rand -base64 32)

  Optional (defaults from VERCEL_URL when unset):
    • WEB_URL, API_URL, NODE_ENV=production

See docs/vercel.md for details.
`);
}

function validateProductionDeploy(source: Record<string, string | undefined>): void {
  const errors: string[] = [];
  const normalized = normalizePlatformEnv(source);

  if (!getMigrationDatabaseUrl(source)) {
    errors.push(
      'Postgres is not linked (expected PRISMA_DATABASE_URL, POSTGRES_PRISMA_URL, or POSTGRES_URL).',
    );
  }
  if (!normalized.REDIS_URL) {
    errors.push('Redis is not linked (expected REDIS_URL or UPSTASH_REDIS_URL).');
  }

  try {
    loadConfig(source);
  } catch (error) {
    if (error instanceof ConfigValidationError) {
      errors.push(error.message);
    } else {
      throw error;
    }
  }

  if (!source.CRON_SECRET) {
    errors.push('CRON_SECRET is required for Vercel Cron background jobs.');
  }

  const providerKey = normalized.PROVIDER_CREDENTIALS_ENCRYPTION_KEY ?? source.PROVIDER_CREDENTIALS_ENCRYPTION_KEY;
  if (providerKey === DEV_PROVIDER_KEY) {
    errors.push('PROVIDER_CREDENTIALS_ENCRYPTION_KEY must not use the dev default in production.');
  }

  if (errors.length > 0) {
    console.error('\nProduction configuration is incomplete:\n');
    for (const error of errors) {
      console.error(`  • ${error}`);
    }
    printSetupChecklist();
    process.exit(1);
  }
}

function runDatabaseSetup(source: Record<string, string | undefined>): void {
  const isProduction = source.VERCEL_ENV === 'production';
  const migrationUrl = getMigrationDatabaseUrl(source);
  if (!migrationUrl) {
    console.warn('\nSkipping database migrate/seed: no Postgres URL found.');
    return;
  }

  console.log('\nApplying database migrations…');
  run('pnpm --filter @ward-comms/database db:deploy', { ...source, DATABASE_URL: migrationUrl });

  const seedUrl = getSeedDatabaseUrl(source) ?? migrationUrl;
  console.log('\nSeeding role and permission catalog…');
  run('pnpm --filter @ward-comms/database db:seed', { ...source, DATABASE_URL: seedUrl });

  if (source.BOOTSTRAP_ADMIN_USERNAME?.trim()) {
    console.log('\nRunning production admin bootstrap…');
    run('pnpm --filter @ward-comms/database db:bootstrap', { ...source, DATABASE_URL: seedUrl });
  } else if (isProduction) {
    console.warn(
      '\nNo BOOTSTRAP_ADMIN_USERNAME set — no admin user will be created. ' +
        'Set BOOTSTRAP_* env vars (see docs/vercel.md) or run db:bootstrap manually.',
    );
  }
}

function logVercelProjectSettings(source: Record<string, string | undefined>): void {
  const keys = Object.keys(source)
    .filter((key) => key.startsWith('VERCEL_PROJECT_SETTINGS_'))
    .sort();

  console.log('\nVercel project settings visible to this build:');
  if (keys.length === 0) {
    console.log('  (none — VERCEL_PROJECT_SETTINGS_* not injected)');
    return;
  }

  for (const key of keys) {
    const value = source[key] ?? '';
    console.log(`  ${key}=${value === '' ? '(empty)' : value}`);
  }

  const outputDirectory = source.VERCEL_PROJECT_SETTINGS_OUTPUT_DIRECTORY?.trim();
  if (outputDirectory) {
    console.warn(
      `\nWARNING: dashboard Output Directory is "${outputDirectory}". ` +
        'If Override is ON, Vercel may treat the Build Output as a static folder and every URL returns NOT_FOUND. ' +
        'Clear Settings → General → Output Directory (leave empty) and set Framework to Other.',
    );
  }
}

async function main(): Promise<void> {
  if (process.env.VERCEL === '1') {
    logVercelProjectSettings(process.env);
  }

  console.log('Building web and API…');
  run('pnpm exec turbo run build --filter=@ward-comms/web... --filter=@ward-comms/api...');
  await assembleVercelOutput();
  finishVercelBuild();
}

function finishVercelBuild(): void {
  if (process.env.VERCEL !== '1') {
    console.log('\nLocal build complete (skipping Vercel deploy setup).');
    return;
  }

  const source = process.env;
  const isProduction = process.env.VERCEL_ENV === 'production';

  if (isProduction) {
    validateProductionDeploy(source);
  }

  runDatabaseSetup(source);

  if (isProduction) {
    console.log('\nVercel production build setup complete.');
  } else {
    console.log('\nPreview build complete (database setup ran when Postgres was linked).');
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
