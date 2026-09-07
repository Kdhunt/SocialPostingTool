import { describe, expect, it } from 'vitest';
import {
  facebookPageCredentialsJson,
  facebookPageDestinationName,
  facebookPageProviderAccountReference,
} from './facebook-page.js';

describe('facebookPageProviderAccountReference', () => {
  it('trims a numeric page id', () => {
    expect(facebookPageProviderAccountReference('  1234567890  ')).toBe('1234567890');
  });

  it('rejects an empty id', () => {
    expect(() => facebookPageProviderAccountReference('   ')).toThrow(/required/);
  });

  it('rejects invalid characters', () => {
    expect(() => facebookPageProviderAccountReference('page id')).toThrow(/invalid characters/);
  });
});

describe('facebookPageCredentialsJson', () => {
  it('serializes pageId and token without extra fields', () => {
    expect(JSON.parse(facebookPageCredentialsJson({ pageId: '111', pageAccessToken: ' token ' }))).toEqual({
      pageAccessToken: 'token',
      pageId: '111',
    });
  });

  it('rejects a blank token', () => {
    expect(() => facebookPageCredentialsJson({ pageId: '111', pageAccessToken: '  ' })).toThrow(/access token/);
  });
});

describe('facebookPageDestinationName', () => {
  it('uses the page name when present', () => {
    expect(facebookPageDestinationName(' Fictional Ward Page ', '111')).toBe('Fictional Ward Page');
  });

  it('falls back to a page-id label', () => {
    expect(facebookPageDestinationName(null, '111')).toBe('Facebook Page 111');
  });
});
