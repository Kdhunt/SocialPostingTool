import { describe, expect, it } from 'vitest';
import { publicWardBulletinResponseSchema, publicWardSlugParamSchema } from './public-bulletin.schema.js';

describe('publicWardSlugParamSchema', () => {
  it('accepts grangecreek', () => {
    expect(publicWardSlugParamSchema.parse('GrangeCreek')).toBe('grangecreek');
  });

  it('rejects reserved-looking punctuation', () => {
    expect(publicWardSlugParamSchema.safeParse('grange-creek').success).toBe(false);
  });
});

describe('publicWardBulletinResponseSchema', () => {
  it('accepts a fictional bulletin payload', () => {
    const parsed = publicWardBulletinResponseSchema.parse({
      wardName: 'Fictional Grange Creek',
      wardSlug: 'grangecreek',
      timeZone: 'America/Denver',
      campaigns: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Fictional Announcement',
          publishedAt: '2026-09-01T18:00:00.000Z',
          message: 'Fictional ward activity this Saturday.',
          imageUrl: null,
          imageAltText: null,
        },
      ],
    });
    expect(parsed.campaigns).toHaveLength(1);
    expect(parsed.campaigns[0]?.name).toBe('Fictional Announcement');
  });
});
