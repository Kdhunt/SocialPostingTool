import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const helpersDir = path.dirname(fileURLToPath(import.meta.url));
const e2eRoot = path.resolve(helpersDir, '../..');

function loadEnvFile(filePath: string, options?: { override?: boolean }): void {
  if (!existsSync(filePath)) {
    return;
  }

  for (const rawLine of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith('#')) {
      continue;
    }

    const separator = line.indexOf('=');
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (options?.override || process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(e2eRoot, '../../.env'));
loadEnvFile(path.join(e2eRoot, '../../.env.e2e'));
loadEnvFile(path.join(e2eRoot, '.env'), { override: true });

export interface E2eCredentials {
  username: string;
  password: string;
  wardCode: string;
}

export const authStatePath = path.join(e2eRoot, '.auth', 'user.json');

export function e2eCdpUrl(): string {
  return process.env.E2E_CDP_URL?.trim() || 'http://127.0.0.1:9222';
}

export function hasStoredAuthState(): boolean {
  if (!existsSync(authStatePath)) {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(readFileSync(authStatePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || !('cookies' in parsed)) {
      return false;
    }
    const cookies = (parsed as { cookies: unknown }).cookies;
    return Array.isArray(cookies) && cookies.length > 0;
  } catch {
    return false;
  }
}

export function e2eBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? '3000'}`;
}

export function isRemoteE2e(): boolean {
  const url = e2eBaseUrl();
  return !url.includes('localhost') && !url.includes('127.0.0.1');
}

export function e2eCredentials(): E2eCredentials | null {
  const username = process.env.E2E_USERNAME?.trim();
  const password = process.env.E2E_PASSWORD;
  const wardCode = process.env.E2E_WARD_CODE?.trim();

  if (!username || !password || !wardCode) {
    return null;
  }

  return { username, password, wardCode };
}

export const missingCredentialsMessage =
  'Set E2E_USERNAME, E2E_PASSWORD, and E2E_WARD_CODE, or save a gitignored session with pnpm --filter @ward-comms/web-e2e test:e2e:save-session.';
