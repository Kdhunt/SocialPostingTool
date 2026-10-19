import sanitizeHtml from 'sanitize-html';
import {
  BULLETIN_ALLOWED_ATTRIBUTES,
  BULLETIN_ALLOWED_LINK_SCHEMES,
  BULLETIN_ALLOWED_TAGS,
} from '@ward-comms/domain';

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...BULLETIN_ALLOWED_TAGS],
  allowedAttributes: Object.fromEntries(
    Object.entries(BULLETIN_ALLOWED_ATTRIBUTES).map(([tag, attributes]) => [tag, [...attributes]]),
  ),
  allowedSchemes: [...BULLETIN_ALLOWED_LINK_SCHEMES],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  // Drop the contents of dangerous elements entirely, not just the tags.
  nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed'],
  disallowedTagsMode: 'discard',
  transformTags: {
    a: (_tagName, attribs) => ({
      tagName: 'a',
      attribs: { href: attribs.href ?? '', rel: 'noopener noreferrer', target: '_blank' },
    }),
  },
};

/**
 * Reduces a section body to the bulletin allowlist (packages/domain
 * bulletin-content.ts). Every stored body goes through this, so the public
 * page can render it as HTML without trusting the editor.
 */
export function sanitizeBulletinHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}
