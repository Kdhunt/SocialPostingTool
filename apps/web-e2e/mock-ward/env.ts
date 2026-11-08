import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SUPERADMIN } from './fixture';

const mockWardDir = path.dirname(fileURLToPath(import.meta.url));
export const e2eRoot = path.resolve(mockWardDir, '..');
export const repoRoot = path.resolve(e2eRoot, '../..');
export const stateDir = path.join(e2eRoot, '.auth', 'local');
export const mockWardStatePath = path.join(stateDir, 'mock-ward.json');
/** Where the local mail catcher saves every account email the app sends. */
export const mailDir = path.join(stateDir, 'mail');

/**
 * Environment for the disposable local stack. Ports differ from the normal
 * dev ports (3000/3001) so the suite never touches a developer's running
 * servers or their dev database. Every value is a throwaway placeholder.
 */
export const LOCAL_E2E_WEB_PORT = Number(process.env.E2E_LOCAL_WEB_PORT ?? 3100);
export const LOCAL_E2E_API_PORT = Number(process.env.E2E_LOCAL_API_PORT ?? 3101);
export const LOCAL_E2E_SMTP_PORT = Number(process.env.E2E_LOCAL_SMTP_PORT ?? 2525);
export const localWebUrl = `http://localhost:${LOCAL_E2E_WEB_PORT}`;
export const localApiUrl = `http://localhost:${LOCAL_E2E_API_PORT}`;

const defaults: Record<string, string> = {
  NODE_ENV: 'development',
  APP_NAME: 'Ward Communications Hub',
  WARD_TIME_ZONE: 'America/Denver',
  API_HOST: '0.0.0.0',
  API_PORT: String(LOCAL_E2E_API_PORT),
  API_URL: localApiUrl,
  WEB_PORT: String(LOCAL_E2E_WEB_PORT),
  WEB_URL: localWebUrl,
  NUXT_PUBLIC_API_BASE_URL: localApiUrl,
  CORS_ALLOWED_ORIGINS: localWebUrl,
  DATABASE_URL: 'postgresql://ward_comms:ward_comms_dev_password@localhost:5432/ward_comms_e2e',
  REDIS_URL: 'redis://localhost:6379/9',
  SESSION_SECRET: 'e2e-only-session-secret-not-for-production-000',
  REFRESH_TOKEN_SECRET: 'e2e-only-refresh-secret-not-for-production-000',
  WARD_CODE_PEPPER: 'e2e-only-ward-code-pepper-not-for-production',
  PROVIDER_CREDENTIALS_ENCRYPTION_KEY: 'e2e-only-provider-credentials-key!!',
  PROVIDER_MODE: 'simulated',
  // Account emails go through the app's real SMTP sender to the local mail catcher.
  SYSTEM_EMAIL_MODE: 'live',
  SYSTEM_EMAIL_PROVIDER: 'smtp',
  SYSTEM_EMAIL_FROM: 'noreply@wardcomms.example.test',
  SYSTEM_EMAIL_SMTP_HOST: '127.0.0.1',
  SYSTEM_EMAIL_SMTP_PORT: String(LOCAL_E2E_SMTP_PORT),
  SYSTEM_EMAIL_SMTP_USER: 'fictional-mail-user',
  SYSTEM_EMAIL_SMTP_PASS: 'fictional-mail-pass',
  SYSTEM_EMAIL_SMTP_SECURE: 'false',
  AI_IMAGE_MODE: 'simulated',
  BOOTSTRAP_ADMIN_USERNAME: SUPERADMIN.username,
  BOOTSTRAP_ADMIN_PASSWORD: SUPERADMIN.password,
  BOOTSTRAP_ADMIN_DISPLAY_NAME: SUPERADMIN.displayName,
  BOOTSTRAP_WARD_CODE: SUPERADMIN.hubCode,
  BOOTSTRAP_WARD_NAME: 'Fictional Platform Hub',
  NUXT_TELEMETRY_DISABLED: '1',
};

/**
 * Applies the local defaults. Variables prefixed with E2E_LOCAL_ override
 * the matching name (for example E2E_LOCAL_DATABASE_URL), so a developer's
 * ordinary DATABASE_URL in .env is never picked up by accident.
 */
export function applyLocalE2eEnv(): NodeJS.ProcessEnv {
  for (const [key, value] of Object.entries(defaults)) {
    process.env[key] = process.env[`E2E_LOCAL_${key}`] ?? value;
  }
  return process.env;
}

/** Refuses to run destructive setup against anything but a local, e2e-named database. */
export function assertDisposableDatabase(databaseUrl: string | undefined): void {
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set for the local e2e suite.');
  }
  const url = new URL(databaseUrl);
  const localHosts = new Set(['localhost', '127.0.0.1', '::1', 'postgres']);
  const databaseName = url.pathname.replace(/^\//, '');
  if (!localHosts.has(url.hostname) || !/(e2e|test)/i.test(databaseName)) {
    throw new Error(
      `Refusing to reset "${url.hostname}/${databaseName}". The mock ward only runs against a local database whose name contains "e2e" or "test".`,
    );
  }
}
