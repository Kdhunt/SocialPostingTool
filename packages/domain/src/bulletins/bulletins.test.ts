import { describe, expect, it } from 'vitest';
import {
  bulletinHtmlToPlainText,
  bulletinPublishProblems,
  defaultBulletinTitle,
  describeBulletinPublishProblem,
  orderBulletinSections,
  plainTextToBulletinHtml,
  safeHttpUrl,
} from './bulletin-content.js';
import {
  DEFAULT_UNIT_ORGANIZATIONS,
  normalizeOrganizationName,
  sameOrganizationName,
} from './organizations.js';

describe('organizations', () => {
  it('ships the requested default organizations', () => {
    expect(DEFAULT_UNIT_ORGANIZATIONS).toEqual([
      'General',
      'Relief Society',
      'Priesthood',
      'Young Women',
      'Youth',
      'Primary',
    ]);
  });

  it('normalizes names and compares them case-insensitively', () => {
    expect(normalizeOrganizationName('  Elders   Quorum ')).toBe('Elders Quorum');
    expect(normalizeOrganizationName('   ')).toBeNull();
    expect(normalizeOrganizationName('x'.repeat(81))).toBeNull();
    expect(sameOrganizationName('Primary', 'primary')).toBe(true);
    expect(sameOrganizationName('Primary', 'Youth')).toBe(false);
  });
});

describe('bulletin content', () => {
  it('accepts only absolute http(s) URLs', () => {
    expect(safeHttpUrl(' https://example.org/flyer ')).toBe('https://example.org/flyer');
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeHttpUrl('/relative')).toBeNull();
    expect(safeHttpUrl('')).toBeNull();
  });

  it('builds a default title from the unit name', () => {
    expect(defaultBulletinTitle('Denver North Stake')).toBe('Denver North Stake News');
  });

  it('turns plain text into escaped paragraphs and bullet lists', () => {
    const html = plainTextToBulletinHtml(
      'Temple cleaning <Sat>\n8:30 am\n\n- Bring water\n- Wear work clothes',
    );
    expect(html).toBe(
      '<p>Temple cleaning &lt;Sat&gt;<br>8:30 am</p><ul><li>Bring water</li><li>Wear work clothes</li></ul>',
    );
    expect(bulletinHtmlToPlainText(html)).toBe(
      'Temple cleaning <Sat>\n8:30 am\nBring water\nWear work clothes',
    );
  });

  it('lists what blocks publishing', () => {
    expect(bulletinPublishProblems({ title: ' ', sections: [] }).map((p) => p.kind)).toEqual([
      'title_required',
      'no_sections',
    ]);
    const problems = bulletinPublishProblems({
      title: 'Stake News',
      sections: [
        { heading: '', bodyHtml: '<p> </p>', imageUrl: null, imageAltText: null },
        {
          heading: 'Blood drive',
          bodyHtml: '',
          imageUrl: 'https://example.org/a.png',
          imageAltText: '',
        },
      ],
    });
    expect(problems).toEqual([
      { kind: 'section_empty', index: 0 },
      { kind: 'image_alt_missing', index: 1 },
    ]);
    expect(describeBulletinPublishProblem(problems[1]!)).toMatch(/section 2/i);
  });

  it('orders sections main column first, then side, by sort order', () => {
    const ordered = orderBulletinSections([
      { id: 'c', column: 'Side' as const, sortOrder: 0 },
      { id: 'b', column: 'Main' as const, sortOrder: 1 },
      { id: 'a', column: 'Main' as const, sortOrder: 0 },
    ]);
    expect(ordered.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});
