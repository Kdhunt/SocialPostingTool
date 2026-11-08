import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { mockWardStatePath } from './env';

/** Ids of everything the builder created, keyed by the fixture keys. */
export interface MockWardState {
  builtAt: string;
  units: Record<string, { id: string; adminUserId: string }>;
  users: Record<string, string>;
  roles: Record<string, string>;
  households: Record<string, string>;
  people: Record<string, string>;
  destinations: Record<string, string>;
  facebookDestinationId: string;
  audiences: Record<string, string>;
  campaigns: Record<string, string>;
  organizations: Record<string, string>;
  bulletins: { published: string; spanish: string; draft: string };
  providerCredentials: { active: string; revoked: string };
  otherWard: { personId: string; audienceId: string };
}

export function saveMockWardState(state: MockWardState): void {
  mkdirSync(path.dirname(mockWardStatePath), { recursive: true });
  writeFileSync(mockWardStatePath, `${JSON.stringify(state, null, 2)}\n`);
}

let cached: MockWardState | null = null;

export function mockWard(): MockWardState {
  if (cached) {
    return cached;
  }
  if (!existsSync(mockWardStatePath)) {
    throw new Error(
      'The mock ward has not been built. Run the local suite with playwright.local.config.ts.',
    );
  }
  cached = JSON.parse(readFileSync(mockWardStatePath, 'utf8')) as MockWardState;
  return cached;
}
