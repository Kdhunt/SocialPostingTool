import { describe, expect, it } from 'vitest';
import { sanitizeBulletinHtml } from './bulletin-html-sanitizer.js';

describe('sanitizeBulletinHtml', () => {
  it('keeps the allowlisted formatting, lists and tables', () => {
    const html =
      '<h3>Schedule</h3><p><strong>Sat</strong> <em>8:30</em> <u>am</u></p><ul><li>Bring water</li></ul>' +
      '<table><tbody><tr><th colspan="2">Ward</th></tr><tr><td>Monte Vista</td><td>Oct 18</td></tr></tbody></table>';
    expect(sanitizeBulletinHtml(html)).toBe(html);
  });

  it('removes scripts, event handlers, styles, iframes and images', () => {
    const dirty =
      '<p onclick="steal()" style="color:red">Hi<script>alert(1)</script></p>' +
      '<iframe src="https://evil.example"></iframe><img src="x" onerror="alert(1)"><style>p{}</style>';
    expect(sanitizeBulletinHtml(dirty)).toBe('<p>Hi</p>');
  });

  it('allows only safe link schemes and forces links to open safely', () => {
    expect(sanitizeBulletinHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a rel="noopener noreferrer" target="_blank">x</a>',
    );
    expect(
      sanitizeBulletinHtml('<a href="https://example.org" target="_self" rel="opener">Sign up</a>'),
    ).toBe('<a href="https://example.org" rel="noopener noreferrer" target="_blank">Sign up</a>');
    expect(sanitizeBulletinHtml('<a href="mailto:clerk@example.org">Email</a>')).toContain(
      'href="mailto:clerk@example.org"',
    );
  });
});
