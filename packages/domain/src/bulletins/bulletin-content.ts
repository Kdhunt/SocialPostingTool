/**
 * Rules for bulletin content that every layer shares: what HTML a section
 * body may contain, which links are allowed, and when a bulletin is ready
 * to publish. The API enforces the allowlist with a sanitizer; the editor
 * only produces these elements in the first place.
 */

/** Elements a section body may contain. Images go in the section's own image field. */
export const BULLETIN_ALLOWED_TAGS: readonly string[] = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'blockquote',
  'a',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'colgroup',
  'col',
];

/** Attributes allowed per element; everything else (styles, event handlers) is dropped. */
export const BULLETIN_ALLOWED_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  // rel and target are always overwritten by the sanitizer (new tab, no opener).
  a: ['href', 'rel', 'target'],
  th: ['colspan', 'rowspan'],
  td: ['colspan', 'rowspan'],
  col: ['span'],
};

/** URL schemes a link inside a section body may use. */
export const BULLETIN_ALLOWED_LINK_SCHEMES: readonly string[] = ['http', 'https', 'mailto', 'tel'];

export const BULLETIN_MAX_SECTIONS = 40;
export const BULLETIN_BODY_MAX_LENGTH = 20_000;

/** Returns the URL if it is an absolute http(s) URL, otherwise null. */
export function safeHttpUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  try {
    const url = new URL(trimmed);
    return url.protocol === 'https:' || url.protocol === 'http:' ? trimmed : null;
  } catch {
    return null;
  }
}

export function defaultBulletinTitle(unitName: string): string {
  return `${unitName} News`;
}

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ENTITIES[char] ?? char);
}

/**
 * Converts plain text (for example a pasted announcement or an AI draft) to
 * allowlisted HTML: blank lines separate paragraphs, lines starting with
 * "- " or "* " become a bullet list.
 */
export function plainTextToBulletinHtml(text: string): string {
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  const html: string[] = [];
  for (const block of blocks) {
    const lines = block.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) continue;
    if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
      const items = lines.map(
        (line) => `<li>${escapeHtml(line.replace(/^\s*[-*]\s+/, '').trim())}</li>`,
      );
      html.push(`<ul>${items.join('')}</ul>`);
    } else {
      html.push(`<p>${lines.map((line) => escapeHtml(line.trim())).join('<br>')}</p>`);
    }
  }
  return html.join('');
}

/** Visible text of a section body, for emptiness checks and plain-text channels. */
export function bulletinHtmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h3|h4|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface BulletinPublishInput {
  title: string;
  sections: ReadonlyArray<{
    heading: string;
    bodyHtml: string;
    imageUrl: string | null;
    imageAltText: string | null;
  }>;
}

export type BulletinPublishProblem =
  | { kind: 'title_required' }
  | { kind: 'no_sections' }
  | { kind: 'section_empty'; index: number }
  | { kind: 'image_alt_missing'; index: number };

/**
 * What stops a bulletin from being published. Images need alt text so the
 * public page and PDF stay accessible to screen-reader users.
 */
export function bulletinPublishProblems(input: BulletinPublishInput): BulletinPublishProblem[] {
  const problems: BulletinPublishProblem[] = [];
  if (input.title.trim().length === 0) problems.push({ kind: 'title_required' });
  if (input.sections.length === 0) problems.push({ kind: 'no_sections' });
  input.sections.forEach((section, index) => {
    const hasText = bulletinHtmlToPlainText(section.bodyHtml).length > 0;
    if (section.heading.trim().length === 0 && !hasText && !section.imageUrl) {
      problems.push({ kind: 'section_empty', index });
    }
    if (section.imageUrl && !(section.imageAltText ?? '').trim()) {
      problems.push({ kind: 'image_alt_missing', index });
    }
  });
  return problems;
}

export function describeBulletinPublishProblem(problem: BulletinPublishProblem): string {
  switch (problem.kind) {
    case 'title_required':
      return 'Add a title before publishing.';
    case 'no_sections':
      return 'Add at least one section before publishing.';
    case 'section_empty':
      return `Section ${problem.index + 1} is empty. Add a heading, text or an image, or remove it.`;
    case 'image_alt_missing':
      return `Section ${problem.index + 1} has an image without a description. Describe the image for people who can't see it.`;
  }
}

/** Sections in reading order: main column first, then side, each by sort order. */
export function orderBulletinSections<T extends { column: 'Main' | 'Side'; sortOrder: number }>(
  sections: readonly T[],
): T[] {
  return [...sections].sort(
    (a, b) =>
      (a.column === b.column ? 0 : a.column === 'Main' ? -1 : 1) || a.sortOrder - b.sortOrder,
  );
}
