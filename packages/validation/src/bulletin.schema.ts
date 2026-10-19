import { z } from 'zod';

export const bulletinTemplateSchema = z.enum(['Newsletter', 'SingleColumn']);
export type BulletinTemplateDto = z.infer<typeof bulletinTemplateSchema>;

export const bulletinColumnSchema = z.enum(['Main', 'Side']);
export type BulletinColumnDto = z.infer<typeof bulletinColumnSchema>;

export const bulletinStatusSchema = z.enum(['Draft', 'Published']);
export type BulletinStatusDto = z.infer<typeof bulletinStatusSchema>;

/** Calendar date, YYYY-MM-DD. */
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-15.');

/** BCP 47 language tag such as "en", "es" or "pt-BR". */
export const bulletinLanguageSchema = z
  .string()
  .trim()
  .regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Use a language code like en, es or pt-BR.');

const optionalHttpUrl = z
  .string()
  .trim()
  .max(2048, 'Links must be at most 2048 characters.')
  .refine(
    (value) => value === '' || /^https?:\/\//i.test(value),
    'Links must start with http:// or https://.',
  )
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional();

const optionalText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} must be at most ${max} characters.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional();

// --- Organizations -----------------------------------------------------------

export const unitOrganizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
});
export type UnitOrganizationDto = z.infer<typeof unitOrganizationSchema>;

export const unitOrganizationListResponseSchema = z.object({
  organizations: z.array(unitOrganizationSchema),
});
export type UnitOrganizationListResponse = z.infer<typeof unitOrganizationListResponseSchema>;

export const saveUnitOrganizationRequestSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(80, 'Name must be at most 80 characters.'),
});
export type SaveUnitOrganizationRequest = z.infer<typeof saveUnitOrganizationRequestSchema>;

// --- Bulletins ---------------------------------------------------------------

export const bulletinSectionInputSchema = z
  .object({
    organizationId: z.string().min(1).nullable().optional(),
    column: bulletinColumnSchema,
    heading: z.string().trim().max(200, 'Headings must be at most 200 characters.'),
    subheading: optionalText(200, 'Subheadings'),
    bodyHtml: z.string().max(20_000, 'This section is too long. Split it into two sections.'),
    imageUrl: optionalHttpUrl,
    imageAltText: optionalText(300, 'Image descriptions'),
    linkUrl: optionalHttpUrl,
    linkLabel: optionalText(120, 'Link labels'),
  })
  .superRefine((section, ctx) => {
    if (section.imageUrl && !section.imageAltText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['imageAltText'],
        message: 'Describe the image for people who can’t see it.',
      });
    }
  });
export type BulletinSectionInput = z.input<typeof bulletinSectionInputSchema>;
export type BulletinSectionInputParsed = z.output<typeof bulletinSectionInputSchema>;

export const createBulletinRequestSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  issueDate: isoDateSchema.optional(),
  template: bulletinTemplateSchema.optional(),
  language: bulletinLanguageSchema.optional(),
});
export type CreateBulletinRequest = z.infer<typeof createBulletinRequestSchema>;

/** Saves the whole bulletin at once; sections replace the stored list in order. */
export const saveBulletinRequestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, 'Title is required.')
    .max(200, 'Titles must be at most 200 characters.'),
  kicker: optionalText(200, 'The line above the title'),
  issueDate: isoDateSchema,
  template: bulletinTemplateSchema,
  language: bulletinLanguageSchema,
  sections: z.array(bulletinSectionInputSchema).max(40, 'A bulletin can have at most 40 sections.'),
});
export type SaveBulletinRequest = z.input<typeof saveBulletinRequestSchema>;

export const copyBulletinAsLanguageRequestSchema = z.object({
  language: bulletinLanguageSchema,
});
export type CopyBulletinAsLanguageRequest = z.infer<typeof copyBulletinAsLanguageRequestSchema>;

export const bulletinSectionSchema = z.object({
  id: z.string(),
  organizationId: z.string().nullable(),
  organizationName: z.string().nullable(),
  column: bulletinColumnSchema,
  sortOrder: z.number().int(),
  heading: z.string(),
  subheading: z.string().nullable(),
  bodyHtml: z.string(),
  imageUrl: z.string().nullable(),
  imageAltText: z.string().nullable(),
  linkUrl: z.string().nullable(),
  linkLabel: z.string().nullable(),
});
export type BulletinSectionDto = z.infer<typeof bulletinSectionSchema>;

export const bulletinEditionSchema = z.object({
  id: z.string(),
  language: z.string(),
  status: bulletinStatusSchema,
});
export type BulletinEditionDto = z.infer<typeof bulletinEditionSchema>;

export const bulletinSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  issueDate: isoDateSchema,
  language: z.string(),
  template: bulletinTemplateSchema,
  status: bulletinStatusSchema,
  publishedAt: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
  sectionCount: z.number().int(),
  translationOfId: z.string().nullable(),
});
export type BulletinSummaryDto = z.infer<typeof bulletinSummarySchema>;

export const bulletinListResponseSchema = z.object({
  bulletins: z.array(bulletinSummarySchema),
});
export type BulletinListResponse = z.infer<typeof bulletinListResponseSchema>;

export const bulletinDetailSchema = bulletinSummarySchema.extend({
  kicker: z.string().nullable(),
  sections: z.array(bulletinSectionSchema),
  /** Other language editions of the same bulletin, including the original. */
  editions: z.array(bulletinEditionSchema),
  unitName: z.string(),
  /** Public page path segment; the bulletin is served at /{unitSlug}/{id} once published. */
  unitSlug: z.string(),
});
export type BulletinDetailDto = z.infer<typeof bulletinDetailSchema>;

// --- Public (anonymous) ------------------------------------------------------

export const publicBulletinSchema = z.object({
  id: z.string(),
  unitName: z.string(),
  unitSlug: z.string(),
  title: z.string(),
  kicker: z.string().nullable(),
  issueDate: isoDateSchema,
  language: z.string(),
  template: bulletinTemplateSchema,
  publishedAt: z.string().datetime(),
  sections: z.array(bulletinSectionSchema.omit({ organizationId: true })),
  editions: z.array(z.object({ id: z.string(), language: z.string() })),
});
export type PublicBulletinDto = z.infer<typeof publicBulletinSchema>;

export const publicBulletinListResponseSchema = z.object({
  bulletins: z.array(
    z.object({ id: z.string(), title: z.string(), issueDate: isoDateSchema, language: z.string() }),
  ),
});
export type PublicBulletinListResponse = z.infer<typeof publicBulletinListResponseSchema>;
