import { describe, expect, it } from 'vitest';
import { chooseFacebookPageRequestSchema, connectFacebookPageRequestSchema } from './facebook-page.schema.js';

describe('connectFacebookPageRequestSchema', () => {
  it('accepts a page id, token, and optional name', () => {
    const parsed = connectFacebookPageRequestSchema.parse({
      pageId: '111',
      pageAccessToken: 'EAABtest',
      pageName: 'Fictional Ward Page',
    });
    expect(parsed.pageId).toBe('111');
    expect(parsed.pageName).toBe('Fictional Ward Page');
  });

  it('rejects a missing token', () => {
    const result = connectFacebookPageRequestSchema.safeParse({ pageId: '111' });
    expect(result.success).toBe(false);
  });
});

describe('chooseFacebookPageRequestSchema', () => {
  it('requires a page id', () => {
    expect(chooseFacebookPageRequestSchema.parse({ pageId: '222' }).pageId).toBe('222');
    expect(chooseFacebookPageRequestSchema.safeParse({}).success).toBe(false);
  });
});
