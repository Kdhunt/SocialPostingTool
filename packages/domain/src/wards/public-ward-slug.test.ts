import { describe, expect, it } from 'vitest';
import {
  assertPublicWardSlug,
  fallbackPublicWardSlug,
  isReservedPublicWardSlug,
  publicWardSlugFromName,
} from './public-ward-slug.js';

describe('publicWardSlugFromName', () => {
  it('turns Grange Creek into grangecreek', () => {
    expect(publicWardSlugFromName('Grange Creek')).toBe('grangecreek');
  });

  it('strips punctuation and lowercases', () => {
    expect(publicWardSlugFromName('Sky-Lake 2nd')).toBe('skylake2nd');
  });
});

describe('assertPublicWardSlug', () => {
  it('accepts grangecreek', () => {
    expect(assertPublicWardSlug(' GrangeCreek ')).toBe('grangecreek');
  });

  it('rejects reserved login', () => {
    expect(isReservedPublicWardSlug('login')).toBe(true);
    expect(() => assertPublicWardSlug('login')).toThrow(/reserved/);
  });

  it('rejects hyphens and empty values', () => {
    expect(() => assertPublicWardSlug('grange-creek')).toThrow(/letters and numbers/);
    expect(() => assertPublicWardSlug('g')).toThrow(/2–64/);
  });
});

describe('fallbackPublicWardSlug', () => {
  it('prefixes ward and keeps alphanumeric characters', () => {
    expect(fallbackPublicWardSlug('ab-12')).toBe('wardab12');
  });
});
