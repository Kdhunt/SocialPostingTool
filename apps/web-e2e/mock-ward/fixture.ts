/**
 * The fictional mock ward used by the local end-to-end suite.
 *
 * Every name, address, email and phone number here is invented. Emails use
 * the reserved `.test` TLD and phone numbers use the reserved 555-01xx block.
 * Never copy real member data into this file (AGENTS.md #5).
 *
 * Passwords and unit codes are throwaway values for a disposable local
 * database only. They are not secrets and must never be reused anywhere real.
 */

export type RoleName = 'WardAdmin' | 'CommunicationsCoordinator' | 'Contributor' | 'Viewer';

export interface MockUser {
  /** Stable key used by tests to pick a signed-in session. */
  key: string;
  username: string;
  displayName: string;
  email: string;
  password: string;
  roles: RoleName[];
  /** Created disabled, to prove a disabled account cannot sign in. */
  disabled?: boolean;
}

export interface MockUnit {
  key: string;
  level: 'District' | 'Region' | 'Stake' | 'Ward';
  name: string;
  publicSlug: string;
  code: string;
  parentKey?: string;
  admin: { username: string; displayName: string; email: string; password: string };
}

export interface MockPerson {
  key: string;
  firstName: string;
  lastName: string;
  preferredName?: string;
  gender: 'Male' | 'Female' | 'NotSpecified';
  /** Age in whole years on the day the suite runs, or null for "unknown". */
  age: number | null;
  householdKey?: string;
  householdRole?: 'Head' | 'Member';
  contacts?: Array<{ type: 'Email' | 'Phone'; value: string; consent?: 'Granted' | 'Denied' }>;
  inactive?: boolean;
}

export const SUPERADMIN = {
  username: 'e2e.superadmin',
  displayName: 'Fictional Platform Operator',
  password: 'Fictional-Super-Admin-42',
  hubCode: 'HUB-E2E-CODE',
} as const;

/** District → Region → Stake → two Wards. Maple Hollow is the main mock ward. */
export const UNITS: MockUnit[] = [
  {
    key: 'district',
    level: 'District',
    name: 'Fictional Summit District',
    publicSlug: 'fictionalsummit',
    code: 'DIST-SUMMIT-0001',
    admin: {
      username: 'district.admin',
      displayName: 'Fictional District Clerk',
      email: 'district.admin@summit.example.test',
      password: 'Fictional-District-42',
    },
  },
  {
    key: 'region',
    level: 'Region',
    name: 'Fictional Basin Region',
    publicSlug: 'fictionalbasin',
    code: 'REGION-BASIN-0001',
    parentKey: 'district',
    admin: {
      username: 'region.admin',
      displayName: 'Fictional Region Clerk',
      email: 'region.admin@basin.example.test',
      password: 'Fictional-Region-42',
    },
  },
  {
    key: 'stake',
    level: 'Stake',
    name: 'Fictional Cedar Ridge Stake',
    publicSlug: 'fictionalcedarridge',
    code: 'STAKE-CEDAR-0001',
    parentKey: 'region',
    admin: {
      username: 'stake.admin',
      displayName: 'Fictional Stake Clerk',
      email: 'stake.admin@cedarridge.example.test',
      password: 'Fictional-Stake-42',
    },
  },
  {
    key: 'ward',
    level: 'Ward',
    name: 'Fictional Maple Hollow Ward',
    publicSlug: 'fictionalmaplehollow',
    code: 'WARD-MAPLE-0001',
    parentKey: 'stake',
    admin: {
      username: 'ward.admin',
      displayName: 'Fictional Ward Clerk',
      email: 'ward.admin@maplehollow.example.test',
      password: 'Fictional-WardAdmin-42',
    },
  },
  {
    key: 'otherWard',
    level: 'Ward',
    name: 'Fictional Aspen Grove Ward',
    publicSlug: 'fictionalaspengrove',
    code: 'WARD-ASPEN-0001',
    parentKey: 'stake',
    admin: {
      username: 'aspen.admin',
      displayName: 'Fictional Aspen Clerk',
      email: 'aspen.admin@aspengrove.example.test',
      password: 'Fictional-AspenAdmin-42',
    },
  },
];

/** Extra accounts inside Maple Hollow, one per role. The ward admin comes from UNITS. */
export const WARD_USERS: MockUser[] = [
  {
    key: 'coordinator',
    username: 'comms.coordinator',
    displayName: 'Fictional Comms Coordinator',
    email: 'coordinator@maplehollow.example.test',
    password: 'Fictional-Coordinator-42',
    roles: ['CommunicationsCoordinator'],
  },
  {
    key: 'contributor',
    username: 'ward.contributor',
    displayName: 'Fictional Ward Contributor',
    email: 'contributor@maplehollow.example.test',
    password: 'Fictional-Contributor-42',
    roles: ['Contributor'],
  },
  {
    key: 'viewer',
    username: 'ward.viewer',
    displayName: 'Fictional Ward Viewer',
    email: 'viewer@maplehollow.example.test',
    password: 'Fictional-Viewer-4242',
    roles: ['Viewer'],
  },
  {
    key: 'disabled',
    username: 'ward.disabled',
    displayName: 'Fictional Disabled Account',
    email: 'disabled@maplehollow.example.test',
    password: 'Fictional-Disabled-42',
    roles: ['Viewer'],
    disabled: true,
  },
];

export const HOUSEHOLDS = [
  {
    key: 'abernathy',
    name: 'Fictional Abernathy Family',
    addressLine1: '101 Maple Hollow Lane',
    city: 'Fictionville',
    state: 'UT',
    postalCode: '84000',
  },
  {
    key: 'brightwater',
    name: 'Fictional Brightwater Family',
    addressLine1: '202 Cedar Loop',
    city: 'Fictionville',
    state: 'UT',
    postalCode: '84000',
  },
  {
    key: 'castellan',
    name: 'Fictional Castellan Household',
    addressLine1: '303 Aspen Court',
    city: 'Fictionville',
    state: 'UT',
    postalCode: '84001',
  },
  {
    key: 'delacroix',
    name: 'Fictional Delacroix Household',
    addressLine1: '404 Juniper Way',
    city: 'Fictionville',
    state: 'UT',
    postalCode: '84001',
  },
  {
    key: 'ellison',
    name: 'Fictional Ellison Household',
    addressLine1: '505 Willow Bend',
    city: 'Fictionville',
    state: 'UT',
    postalCode: '84002',
  },
] as const;

/**
 * People designed to exercise every directory, audience and delivery rule:
 * adults and minors, granted/denied/missing consent, email and SMS, a
 * simulated permanent provider failure, an unknown birth date (which the
 * app must treat as a minor) and an inactive record.
 */
export const PEOPLE: MockPerson[] = [
  {
    key: 'aaron',
    firstName: 'Aaron',
    lastName: 'Abernathy',
    gender: 'Male',
    age: 44,
    householdKey: 'abernathy',
    householdRole: 'Head',
    contacts: [
      { type: 'Email', value: 'aaron.abernathy@example.test', consent: 'Granted' },
      { type: 'Phone', value: '(801) 555-0111', consent: 'Granted' },
    ],
  },
  {
    key: 'beatrice',
    firstName: 'Beatrice',
    lastName: 'Abernathy',
    preferredName: 'Bea Abernathy',
    gender: 'Female',
    age: 42,
    householdKey: 'abernathy',
    householdRole: 'Member',
    contacts: [{ type: 'Email', value: 'bea.abernathy@example.test', consent: 'Granted' }],
  },
  {
    key: 'cora',
    firstName: 'Cora',
    lastName: 'Abernathy',
    gender: 'Female',
    age: 15,
    householdKey: 'abernathy',
    householdRole: 'Member',
    contacts: [{ type: 'Email', value: 'cora.minor@example.test', consent: 'Granted' }],
  },
  {
    key: 'dashiell',
    firstName: 'Dashiell',
    lastName: 'Abernathy',
    gender: 'Male',
    age: 8,
    householdKey: 'abernathy',
    householdRole: 'Member',
  },
  {
    key: 'evander',
    firstName: 'Evander',
    lastName: 'Brightwater',
    gender: 'Male',
    age: 67,
    householdKey: 'brightwater',
    householdRole: 'Head',
    contacts: [{ type: 'Email', value: 'evander.brightwater@example.test', consent: 'Granted' }],
  },
  {
    key: 'fiona',
    firstName: 'Fiona',
    lastName: 'Brightwater',
    gender: 'Female',
    age: 65,
    householdKey: 'brightwater',
    householdRole: 'Member',
    contacts: [{ type: 'Email', value: 'fiona.brightwater@example.test', consent: 'Denied' }],
  },
  {
    key: 'gideon',
    firstName: 'Gideon',
    lastName: 'Castellan',
    gender: 'Male',
    age: 29,
    householdKey: 'castellan',
    householdRole: 'Head',
    contacts: [{ type: 'Phone', value: '(801) 555-0122', consent: 'Granted' }],
  },
  {
    key: 'harriet',
    firstName: 'Harriet',
    lastName: 'Delacroix',
    gender: 'Female',
    age: 36,
    householdKey: 'delacroix',
    householdRole: 'Head',
    contacts: [
      {
        type: 'Email',
        value: 'simulate-permanent-failure.harriet@example.test',
        consent: 'Granted',
      },
    ],
  },
  {
    key: 'ignatius',
    firstName: 'Ignatius',
    lastName: 'Delacroix',
    gender: 'Male',
    age: 38,
    householdKey: 'delacroix',
    householdRole: 'Member',
    contacts: [{ type: 'Email', value: 'ignatius.delacroix@example.test' }],
  },
  {
    key: 'juniper',
    firstName: 'Juniper',
    lastName: 'Ellison',
    gender: 'NotSpecified',
    age: null,
    householdKey: 'ellison',
    householdRole: 'Head',
    contacts: [{ type: 'Email', value: 'juniper.ellison@example.test', consent: 'Granted' }],
  },
  {
    key: 'kellan',
    firstName: 'Kellan',
    lastName: 'Ellison',
    gender: 'Male',
    age: 51,
    householdKey: 'ellison',
    householdRole: 'Member',
    inactive: true,
    contacts: [{ type: 'Email', value: 'kellan.ellison@example.test', consent: 'Granted' }],
  },
  {
    key: 'aspenOnly',
    firstName: 'Zebulon',
    lastName: 'Aspenfield',
    gender: 'Male',
    age: 40,
  },
];

export const DESTINATIONS = [
  { key: 'email', name: 'Fictional Ward Email List', channel: 'Email' as const },
  { key: 'sms', name: 'Fictional Ward Text Alerts', channel: 'Sms' as const },
  {
    key: 'archived',
    name: 'Fictional Retired Email List',
    channel: 'Email' as const,
    archived: true,
  },
];

export const FACEBOOK_PAGE = {
  pageId: '100000000000001',
  pageName: 'Fictional Maple Hollow Ward Page',
  pageAccessToken: 'fictional-page-access-token-not-real',
} as const;

export const AUDIENCES = {
  adults: { name: 'Fictional All Adults', description: 'Rule-based: everyone 18 and older.' },
  youth: { name: 'Fictional Youth', description: 'Manual list of youth.' },
  sisters: { name: 'Fictional Relief Society', description: 'Rule-based: adult women.' },
  newsletter: {
    name: 'Fictional Newsletter Readers',
    description: 'Manual list that overlaps with All Adults.',
  },
  textAlerts: { name: 'Fictional Text Alerts', description: 'SMS subscribers.' },
  archived: { name: 'Fictional Old Committee', description: 'Archived audience.' },
  empty: {
    name: 'Fictional Empty Audience',
    description: 'No members or destinations; safe to delete.',
  },
} as const;

export const CAMPAIGNS = {
  draft: {
    name: 'Fictional Ward Picnic',
    baseMessage: 'Join us for the fictional ward picnic in the park.',
  },
  pending: {
    name: 'Fictional Temple Trip Reminder',
    baseMessage: 'The fictional temple trip leaves at 7am.',
  },
  approved: {
    name: 'Fictional Choir Practice',
    baseMessage: 'Fictional choir practice moves to Thursday.',
  },
  rejected: {
    name: 'Fictional Budget Note',
    baseMessage: 'A fictional note about the activity budget.',
  },
  scheduled: {
    name: 'Fictional Christmas Program',
    baseMessage: 'The fictional Christmas program is next month.',
  },
  sent: {
    name: 'Fictional Welcome New Families',
    baseMessage: 'Welcome to our fictional new families!',
  },
  cancelled: {
    name: 'Fictional Fireside Postponed',
    baseMessage: 'The fictional fireside is postponed.',
  },
  archived: { name: 'Fictional Archived Draft', baseMessage: 'An archived fictional draft.' },
} as const;

export const BULLETIN = {
  title: 'Fictional Maple Hollow Weekly',
  kicker: 'Fictional Maple Hollow Ward',
  spanishTitle: 'Boletín Ficticio de Maple Hollow',
  draftTitle: 'Fictional Draft Bulletin',
} as const;

export const CUSTOM_ORGANIZATION = 'Fictional Elders Quorum';

/** ISO date (YYYY-MM-DD) for someone who turns `age` today minus 30 days. */
export function birthDateForAge(age: number, today: Date = new Date()): string {
  const date = new Date(
    Date.UTC(today.getUTCFullYear() - age, today.getUTCMonth(), today.getUTCDate()),
  );
  date.setUTCDate(date.getUTCDate() - 30);
  return date.toISOString().slice(0, 10);
}

export function personDisplayName(person: MockPerson): string {
  return person.preferredName ?? `${person.firstName} ${person.lastName}`;
}

export function unitByKey(key: string): MockUnit {
  const unit = UNITS.find((candidate) => candidate.key === key);
  if (!unit) {
    throw new Error(`Unknown mock unit "${key}".`);
  }
  return unit;
}

export function personByKey(key: string): MockPerson {
  const person = PEOPLE.find((candidate) => candidate.key === key);
  if (!person) {
    throw new Error(`Unknown mock person "${key}".`);
  }
  return person;
}
