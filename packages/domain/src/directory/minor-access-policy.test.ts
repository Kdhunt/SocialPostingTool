import { describe, expect, it } from 'vitest';
import { canViewRestrictedMinorFields } from './minor-access-policy.js';

const asOf = new Date('2026-01-01T00:00:00.000Z');

describe('canViewRestrictedMinorFields', () => {
  it('allows any viewer to see an adult person full contact details', () => {
    const dateOfBirth = new Date('1980-01-01');
    expect(canViewRestrictedMinorFields({ dateOfBirth, viewerHasMinorContactPermission: false, asOf })).toBe(true);
  });

  it('blocks a viewer without the minors.contact.read permission from a minor record', () => {
    const dateOfBirth = new Date('2015-01-01');
    expect(canViewRestrictedMinorFields({ dateOfBirth, viewerHasMinorContactPermission: false, asOf })).toBe(false);
  });

  it('allows a viewer with the minors.contact.read permission to see a minor record', () => {
    const dateOfBirth = new Date('2015-01-01');
    expect(canViewRestrictedMinorFields({ dateOfBirth, viewerHasMinorContactPermission: true, asOf })).toBe(true);
  });

  it('fails closed (treats as restricted) when date of birth is unknown, for an unprivileged viewer', () => {
    expect(canViewRestrictedMinorFields({ dateOfBirth: null, viewerHasMinorContactPermission: false, asOf })).toBe(
      false,
    );
  });

  it('still allows a privileged viewer to see a record with unknown date of birth', () => {
    expect(canViewRestrictedMinorFields({ dateOfBirth: null, viewerHasMinorContactPermission: true, asOf })).toBe(
      true,
    );
  });

  it('treats a person turning 18 exactly on asOf as no longer a minor', () => {
    const dateOfBirth = new Date('2008-01-01');
    expect(canViewRestrictedMinorFields({ dateOfBirth, viewerHasMinorContactPermission: false, asOf })).toBe(true);
  });
});
