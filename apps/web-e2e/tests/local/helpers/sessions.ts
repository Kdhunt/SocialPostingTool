import path from 'node:path';
import { stateDir } from '../../../mock-ward/env';
import { SUPERADMIN, WARD_USERS, unitByKey } from '../../../mock-ward/fixture';

export type SessionKey =
  | 'superadmin'
  | 'districtAdmin'
  | 'stakeAdmin'
  | 'wardAdmin'
  | 'coordinator'
  | 'contributor'
  | 'viewer'
  | 'otherWardAdmin';

export interface SessionCredentials {
  username: string;
  password: string;
  unitCode?: string;
  displayName: string;
}

function wardUser(key: string): SessionCredentials {
  const user = WARD_USERS.find((candidate) => candidate.key === key);
  if (!user) throw new Error(`Unknown ward user ${key}`);
  return {
    username: user.username,
    password: user.password,
    unitCode: unitByKey('ward').code,
    displayName: user.displayName,
  };
}

function unitAdmin(unitKey: string): SessionCredentials {
  const unit = unitByKey(unitKey);
  return {
    username: unit.admin.username,
    password: unit.admin.password,
    unitCode: unit.code,
    displayName: unit.admin.displayName,
  };
}

export const SESSIONS: Record<SessionKey, SessionCredentials> = {
  superadmin: {
    username: SUPERADMIN.username,
    password: SUPERADMIN.password,
    displayName: SUPERADMIN.displayName,
  },
  districtAdmin: unitAdmin('district'),
  stakeAdmin: unitAdmin('stake'),
  wardAdmin: unitAdmin('ward'),
  coordinator: wardUser('coordinator'),
  contributor: wardUser('contributor'),
  viewer: wardUser('viewer'),
  otherWardAdmin: unitAdmin('otherWard'),
};

export function storageStatePath(key: SessionKey): string {
  return path.join(stateDir, `${key}.json`);
}

/** `test.use(as('viewer'))` runs the file or describe block signed in as that role. */
export function as(key: SessionKey): { storageState: string } {
  return { storageState: storageStatePath(key) };
}
