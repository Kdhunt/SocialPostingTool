import { describe, expect, it } from 'vitest';
import { bulletinSectionInputSchema, saveBulletinRequestSchema } from './bulletin.schema.js';

describe('bulletinSectionInputSchema', () => {
  it('requires alt text when a section has an image', () => {
    const result = bulletinSectionInputSchema.safeParse({
      column: 'Main',
      heading: 'Blood drive',
      bodyHtml: '',
      imageUrl: 'https://example.org/a.png',
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.path).toEqual(['imageAltText']);
  });

  it('rejects non-http links and blanks optional fields to null', () => {
    expect(
      bulletinSectionInputSchema.safeParse({
        column: 'Main',
        heading: '',
        bodyHtml: '',
        linkUrl: 'javascript:alert(1)',
      }).success,
    ).toBe(false);
    const parsed = bulletinSectionInputSchema.parse({
      column: 'Main',
      heading: ' FYI ',
      bodyHtml: '',
      linkUrl: '',
      subheading: ' ',
    });
    expect(parsed).toMatchObject({
      heading: 'FYI',
      linkUrl: null,
      subheading: null,
      column: 'Main',
      bodyHtml: '',
    });
  });
});

describe('saveBulletinRequestSchema', () => {
  it('accepts a full bulletin and rejects bad dates and languages', () => {
    const base = {
      title: 'Stake News',
      issueDate: '2026-10-15',
      template: 'Newsletter',
      language: 'es',
      sections: [],
    };
    expect(saveBulletinRequestSchema.safeParse(base).success).toBe(true);
    expect(saveBulletinRequestSchema.safeParse({ ...base, issueDate: '10/15/2026' }).success).toBe(
      false,
    );
    expect(saveBulletinRequestSchema.safeParse({ ...base, language: 'Spanish' }).success).toBe(
      false,
    );
    expect(saveBulletinRequestSchema.safeParse({ ...base, language: 'pt-BR' }).success).toBe(true);
  });
});
