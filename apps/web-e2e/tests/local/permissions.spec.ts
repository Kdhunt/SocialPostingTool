import type { APIRequestContext } from '@playwright/test';
import type { MockWardState } from '../../mock-ward/state';
import { createThrowawayUser, expect, test } from './helpers/fixtures';
import type { SessionKey } from './helpers/sessions';

/**
 * Server-side authorization for every role (AGENTS.md #4: never trust
 * frontend authorization). Requests that a role may make can still fail
 * validation (400) or not-found (404) — what matters is that only the
 * forbidden ones come back 403, and anonymous calls come back 401.
 *
 * Writes use deliberately invalid bodies, so an allowed call is rejected by
 * validation and nothing in the mock ward changes.
 */
type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface Rule {
  method: Method;
  path: (ward: MockWardState) => string;
  allowed: SessionKey[];
}

const WARD_ROLES: SessionKey[] = ['wardAdmin', 'coordinator', 'contributor', 'viewer'];
const ALL: SessionKey[] = ['superadmin', ...WARD_ROLES];
const admin: SessionKey[] = ['wardAdmin'];
const directoryReaders: SessionKey[] = WARD_ROLES;
const directoryWriters: SessionKey[] = ['wardAdmin', 'contributor'];
const audienceReaders: SessionKey[] = ['wardAdmin', 'coordinator', 'contributor'];
const audienceManagers: SessionKey[] = ['wardAdmin', 'coordinator'];
const campaignReaders: SessionKey[] = ['wardAdmin', 'coordinator', 'contributor'];
const drafters: SessionKey[] = ['wardAdmin', 'coordinator', 'contributor'];
const approvers: SessionKey[] = ['wardAdmin', 'coordinator'];
const senders: SessionKey[] = ['wardAdmin', 'coordinator'];

const RULES: Rule[] = [
  { method: 'get', path: () => '/directory/people', allowed: directoryReaders },
  { method: 'get', path: (w) => `/directory/people/${w.people.aaron}`, allowed: directoryReaders },
  { method: 'post', path: () => '/directory/people', allowed: directoryWriters },
  {
    method: 'patch',
    path: (w) => `/directory/people/${w.people.aaron}`,
    allowed: directoryWriters,
  },
  {
    method: 'post',
    path: (w) => `/directory/people/${w.people.aaron}/contact-methods`,
    allowed: directoryWriters,
  },
  { method: 'get', path: () => '/directory/households', allowed: directoryReaders },
  { method: 'post', path: () => '/directory/households', allowed: directoryWriters },
  { method: 'get', path: () => '/audiences', allowed: audienceReaders },
  { method: 'post', path: () => '/audiences', allowed: audienceManagers },
  {
    method: 'put',
    path: (w) => `/audiences/${w.audiences.adults}/rules`,
    allowed: audienceManagers,
  },
  { method: 'get', path: () => '/communication-destinations', allowed: audienceReaders },
  { method: 'post', path: () => '/communication-destinations', allowed: audienceManagers },
  { method: 'get', path: () => '/campaigns', allowed: campaignReaders },
  { method: 'post', path: () => '/campaigns', allowed: drafters },
  { method: 'post', path: (w) => `/campaigns/${w.campaigns.pending}/approve`, allowed: approvers },
  { method: 'post', path: (w) => `/campaigns/${w.campaigns.sent}/schedule`, allowed: senders },
  {
    method: 'get',
    path: (w) => `/campaigns/${w.campaigns.sent}/delivery-batches`,
    allowed: senders,
  },
  { method: 'get', path: () => '/bulletins', allowed: drafters },
  { method: 'post', path: (w) => `/bulletins/${w.bulletins.draft}/editions`, allowed: drafters },
  { method: 'get', path: () => '/organizations', allowed: drafters },
  { method: 'post', path: () => '/organizations', allowed: admin },
  { method: 'get', path: () => '/users', allowed: admin },
  { method: 'post', path: () => '/users', allowed: admin },
  { method: 'put', path: (w) => `/users/${w.users.viewer}/roles`, allowed: admin },
  { method: 'get', path: () => '/ward/code', allowed: admin },
  { method: 'post', path: () => '/ward/code/rotate', allowed: admin },
  { method: 'get', path: () => '/provider-credentials', allowed: senders },
  { method: 'post', path: () => '/provider-credentials', allowed: senders },
  { method: 'get', path: () => '/facebook-page', allowed: senders },
  { method: 'get', path: () => '/audit', allowed: approvers },
  { method: 'get', path: () => '/platform/wards', allowed: ['superadmin'] },
];

async function call(api: APIRequestContext, method: Method, path: string): Promise<number> {
  const options =
    method === 'get' || method === 'delete' ? {} : { data: { fictionalInvalidField: true } };
  return (await api[method](path, options)).status();
}

test.describe('API authorization matrix', () => {
  for (const role of ALL) {
    test(`${role}: only the permitted endpoints answer`, async ({ api, ward }) => {
      const client = await api(role);
      const problems: string[] = [];
      for (const rule of RULES) {
        const status = await call(client, rule.method, rule.path(ward));
        const shouldAllow = rule.allowed.includes(role);
        if (shouldAllow && (status === 403 || status === 401))
          problems.push(
            `${rule.method.toUpperCase()} ${rule.path(ward)} → ${status}, expected access`,
          );
        if (!shouldAllow && status !== 403)
          problems.push(
            `${rule.method.toUpperCase()} ${rule.path(ward)} → ${status}, expected 403`,
          );
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  }

  test('anonymous: every protected endpoint answers 401', async ({ anonymousApi, ward }) => {
    const problems: string[] = [];
    for (const rule of RULES) {
      const status = await call(anonymousApi, rule.method, rule.path(ward));
      if (status !== 401)
        problems.push(`${rule.method.toUpperCase()} ${rule.path(ward)} → ${status}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('public endpoints answer without a session', async ({ anonymousApi, ward }) => {
    expect((await anonymousApi.get('/health')).status()).toBe(200);
    expect((await anonymousApi.get('/public/wards/fictionalmaplehollow/campaigns')).status()).toBe(
      200,
    );
    expect((await anonymousApi.get('/public/wards/fictionalmaplehollow/bulletins')).status()).toBe(
      200,
    );
    expect(
      (
        await anonymousApi.get(
          `/public/wards/fictionalmaplehollow/bulletins/${ward.bulletins.published}`,
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await anonymousApi.get(
          `/public/wards/fictionalmaplehollow/bulletins/${ward.bulletins.draft}`,
        )
      ).status(),
    ).toBe(404);
  });

  test('public campaign data never includes member contact details', async ({ anonymousApi }) => {
    const body = await (
      await anonymousApi.get('/public/wards/fictionalmaplehollow/campaigns')
    ).text();
    expect(body).not.toMatch(/@example\.test|555-01|Abernathy|Brightwater/);
  });
});

test.describe('Tenant isolation', () => {
  test('a neighbouring ward’s admin cannot read or change Maple Hollow records', async ({
    api,
    ward,
  }) => {
    // A throwaway Maple Hollow account is the target, so a leak cannot break other tests' sessions.
    const target = await createThrowawayUser(await api('wardAdmin'), ward);
    const other = await api('otherWardAdmin');
    const checks: Array<[Method, string]> = [
      ['get', `/directory/people/${ward.people.aaron}`],
      ['patch', `/directory/people/${ward.people.aaron}`],
      ['get', `/directory/households/${ward.households.abernathy}`],
      ['get', `/audiences/${ward.audiences.adults}`],
      ['get', `/campaigns/${ward.campaigns.draft}`],
      ['post', `/campaigns/${ward.campaigns.pending}/approve`],
      ['get', `/bulletins/${ward.bulletins.published}`],
      ['post', `/auth/users/${target.id}/disable`],
      ['post', `/auth/users/${target.id}/enable`],
    ];
    const leaks: string[] = [];
    for (const [method, path] of checks) {
      const status = await call(other, method, path);
      if (status < 400) leaks.push(`${method.toUpperCase()} ${path} → ${status}`);
    }
    expect(leaks, leaks.join('\n')).toEqual([]);

    const people = (await (await other.get('/directory/people')).json()) as {
      people: Array<{ lastName: string }>;
    };
    expect(people.people.map((person) => person.lastName)).toEqual(['Aspenfield']);
    const users = (await (await other.get('/users')).json()) as {
      users: Array<{ username: string }>;
    };
    expect(users.users.map((user) => user.username)).not.toContain('ward.viewer');
  });
});
