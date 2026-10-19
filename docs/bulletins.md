# Bulletins

## Requirement

Units (wards, stakes, regions, districts) publish newsletter-style
bulletins: a header and sections, each section filed under a named
organization (General, Relief Society, Priesthood, Young Women, Youth,
Primary, or the unit's own). A bulletin is edited with rich text (headings,
lists, links, tables) plus an image per section, laid out by a template, and
published to `/{publicSlug}/{bulletinId}`, where readers can print it or save
it as a PDF. Linked items and the page itself get QR codes. Other languages
are separate editions linked to the original.

## Model

| Table               | Purpose                                                                       |
| ------------------- | ----------------------------------------------------------------------------- |
| `unit_organization` | Organizations per unit. Seeded with defaults; rename, add, archive.           |
| `bulletin`          | Header (title, line above it, date, language, template), status, edition link |
| `bulletin_section`  | Ordered blocks: organization, column, heading, subheading, body, image, link  |

- `template`: `Newsletter` (main + side column, modeled on a printed stake
  newsletter) or `SingleColumn` (better for phones and email).
- `language` + `translation_of_id`: an edition in another language points at
  the original; readers can switch between published editions.
- Saving replaces all sections in one transaction; `sort_order` counts within
  each column.

Domain rules live in `packages/domain/src/bulletins/`: the default
organizations, the HTML allowlist, link rules, and what blocks publishing
(no title, no sections, an empty section, an image without a description).

## Content safety

Section bodies are stored as HTML limited to the allowlist in
`bulletin-content.ts` (paragraphs, h3/h4, bold/italic/underline/strike,
lists, blockquote, links, tables). The API runs every body through
`sanitize-html` on save; scripts, styles, event handlers, iframes and images
are removed, links must be absolute http, https, mailto or tel links (relative
and protocol-relative ones are dropped) and always open in a new tab with
`rel="noopener noreferrer"`. Image and "more information"
links must be absolute http(s) URLs. The public page renders only stored,
sanitized HTML.

## Authorization

| Action                                  | Permission                                                       |
| --------------------------------------- | ---------------------------------------------------------------- |
| View bulletins                          | any of `campaigns.create`, `campaigns.approve`, `campaigns.send` |
| Create, edit drafts, start an edition   | `campaigns.create`                                               |
| Publish, unpublish                      | `campaigns.send`                                                 |
| Edit or delete a **published** bulletin | `campaigns.send`                                                 |
| Manage organizations                    | `ward.manage`                                                    |

Everything is scoped to the signed-in user's unit; another unit's bulletin
reads as "not found". The public endpoints look a unit up by public slug
only (never the sign-in code) and return published bulletins only.

## Concurrency

- Saves carry the `updatedAt` the editor loaded (`expectedUpdatedAt`). A save
  over a newer version, including one published in between, returns 409
  ("changed or published since you opened it"). The repository also guards
  the write on the version it read, so a drafter can never overwrite a
  bulletin that became live after the permission check.
- One edition per language per bulletin, enforced in a transaction with a
  per-edition-set advisory lock (copying and changing an edition's language).
- Organization names are unique per unit (case-insensitive), enforced the
  same way. Both use advisory locks rather than partial indexes, which Prisma
  Migrate cannot represent.
- The editor locks its fields while a request runs, so text typed meanwhile
  is never replaced by the response.

## Public reads

- Successful public reads are sent with
  `Cache-Control: public, max-age=60, s-maxage=60, stale-while-revalidate=300`,
  so after unpublishing, a bulletin can stay visible for up to a minute (a
  few more minutes from stale CDN copies). Not-found responses are never
  cacheable, so a newly published bulletin appears immediately.
- Bulletin reads have their own per-address budget (2,000 per 15 minutes),
  separate from the campaign board's 120, because a whole congregation may
  scan the QR code from one chapel network or carrier address.
- Request bodies up to 2 MB are accepted (a full 40-section bulletin can
  exceed Express's 100 KB default).

## Audit

`bulletin.created`, `bulletin.updated` (with section count and whether it was
live), `bulletin.published`, `bulletin.unpublished`,
`bulletin.edition_created`, `bulletin.archived`; `organization.created`,
`organization.renamed`, `organization.archived`.

## API

| Route                                                        | Notes                                                  |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| `GET /bulletins`, `GET /bulletins/:id`                       |                                                        |
| `POST /bulletins`                                            | defaults: "{Unit} News", today in the unit's time zone |
| `PUT /bulletins/:id`                                         | whole bulletin, sections replace                       |
| `POST /bulletins/:id/publish`, `/unpublish`                  |                                                        |
| `POST /bulletins/:id/editions` `{ language }`                | draft copy to translate                                |
| `DELETE /bulletins/:id`                                      | archives                                               |
| `GET/POST /organizations`, `PATCH/DELETE /organizations/:id` |                                                        |
| `GET /public/wards/:slug/bulletins`                          | anonymous, published only                              |
| `GET /public/wards/:slug/bulletins/:id`                      | anonymous, published only                              |

## Web

- **Messaging → Bulletins**: list and "New bulletin".
- Editor (`/bulletins/:id`): header fields, sections with an organization,
  column, rich text, image and "more information" link, and a live preview
  of the actual page scaled to fit. "Copy to translate" starts another
  language edition.
- Public page `/{slug}/{id}`: the newsletter, links to other editions, and
  **Save as PDF**. The unit's public page lists its published bulletins.
- **Administration → Organizations**: rename, add, remove.

### PDF

PDF export uses the browser's print dialog ("Save as PDF") with print styles
that leave only the newsletter on letter-size pages. This keeps text sharp
and selectable and needs no server-side browser, which would not fit
comfortably in a Vercel function. A server-generated PDF (for example to
attach to email) is a possible follow-up.

## Migration notes

`20261019000000_bulletins` adds the `BulletinStatus`, `BulletinTemplate` and
`BulletinColumn` enums and the three tables, and inserts the six default
organizations for every existing unit. New units get them on creation
(provisioning, bootstrap and dev seeds).

Rollback: drop `bulletin_section`, `bulletin`, `unit_organization` (in that
order) and the three enums. No existing table is altered.

## Known limits / follow-ups

- Printing relies on CSS `:has()` (Chrome 105+, Safari 15.4+, Firefox 121+).
  Older browsers print the whole page instead of only the bulletin.

- Images are added by link; there is no upload yet (needs file storage such
  as Vercel Blob). AI-generated image links from OpenAI expire, so they must
  be re-hosted before being used in a bulletin.
- Sending a bulletin to email, SMS or social channels, with per-section
  channel choices, is the next piece (channel management).
- AI translation of an edition is planned; for now "Copy to translate"
  creates the copy to translate by hand.
