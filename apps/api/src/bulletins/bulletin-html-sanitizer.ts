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
    // Only absolute links with an allowed scheme survive; relative and
    // protocol-relative hrefs are dropped (allowedSchemes ignores them).
    a: (_tagName, attribs) => {
      const href = (attribs.href ?? '').trim();
      const allowed = new RegExp(`^(${BULLETIN_ALLOWED_LINK_SCHEMES.join('|')}):`, 'i').test(href);
      return {
        tagName: 'a',
        attribs: { ...(allowed ? { href } : {}), rel: 'noopener noreferrer', target: '_blank' },
      };
    },
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
