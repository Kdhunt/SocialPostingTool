import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Bulletin } from '@prisma/client';
import {
  bulletinPublishProblems,
  defaultBulletinTitle,
  describeBulletinPublishProblem,
  safeHttpUrl,
} from '@ward-comms/domain';
import type {
  BulletinDetailDto,
  BulletinListResponse,
  BulletinSectionDto,
  BulletinSectionInputParsed,
  BulletinSummaryDto,
  CreateBulletinRequest,
  PublicBulletinDto,
  PublicBulletinListResponse,
} from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import { WardRepository } from '../admin/repositories/ward.repository.js';
import { sanitizeBulletinHtml } from './bulletin-html-sanitizer.js';
import {
  BulletinRepository,
  type BulletinFields,
  type BulletinSectionRow,
  type BulletinWithSections,
} from './repositories/bulletin.repository.js';
import { UnitOrganizationRepository } from './repositories/unit-organization.repository.js';

export interface BulletinActionContext {
  actorUserId: string;
  /** The actor's permission keys; publishing and editing live bulletins need `campaigns.send`. */
  permissions: readonly string[];
  ipAddress: string | null;
  userAgent: string | null;
}

export interface SaveBulletinInput {
  title: string;
  kicker?: string | null;
  issueDate: string;
  template: 'Newsletter' | 'SingleColumn';
  language: string;
  sections: BulletinSectionInputParsed[];
}

const PUBLISH_PERMISSION = 'campaigns.send';

function toDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function fromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayIn(timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/**
 * Bulletins (newsletters) for one unit. Every method is scoped to the
 * caller's unit; another unit's bulletin reads as "not found". Section
 * bodies are sanitized on the way in, so the public page can render them.
 */
@Injectable()
export class BulletinsService {
  constructor(
    @Inject(BulletinRepository) private readonly bulletins: BulletinRepository,
    @Inject(UnitOrganizationRepository) private readonly organizations: UnitOrganizationRepository,
    @Inject(WardRepository) private readonly wards: WardRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // --- Reads -----------------------------------------------------------------

  async list(wardId: string): Promise<BulletinListResponse> {
    const rows = await this.bulletins.listForWard(wardId);
    return { bulletins: rows.map((row) => this.toSummary(row, row._count.sections)) };
  }

  async get(wardId: string, id: string): Promise<BulletinDetailDto> {
    const bulletin = await this.bulletins.findForWard(wardId, id);
    if (!bulletin) throw new NotFoundException('Bulletin not found.');
    return this.toDetail(bulletin);
  }

  // --- Writes ----------------------------------------------------------------

  async create(
    wardId: string,
    input: CreateBulletinRequest,
    context: BulletinActionContext,
  ): Promise<BulletinDetailDto> {
    const unit = await this.wards.findActiveById(wardId);
    if (!unit) throw new NotFoundException('Unit not found.');

    const created = await this.bulletins.create(wardId, {
      title: input.title ?? defaultBulletinTitle(unit.name),
      kicker: null,
      issueDate: toDate(input.issueDate ?? todayIn(unit.timeZone)),
      template: input.template ?? 'Newsletter',
      language: input.language ?? 'en',
      createdByUserId: context.actorUserId,
    });
    await this.record(wardId, context, 'bulletin.created', created.id, {
      language: created.language,
    });
    return this.get(wardId, created.id);
  }

  async save(
    wardId: string,
    id: string,
    input: SaveBulletinInput,
    context: BulletinActionContext,
  ): Promise<BulletinDetailDto> {
    const existing = await this.bulletins.findForWard(wardId, id);
    if (!existing) throw new NotFoundException('Bulletin not found.');
    if (existing.status === 'Published' && !context.permissions.includes(PUBLISH_PERMISSION)) {
      throw new ForbiddenException(
        'This bulletin is live. Ask someone who can publish to make changes, or to unpublish it.',
      );
    }

    const sections = await this.buildSections(wardId, input.sections);
    const fields: BulletinFields = {
      title: input.title,
      kicker: input.kicker ?? null,
      issueDate: toDate(input.issueDate),
      template: input.template,
      language: input.language,
    };
    await this.bulletins.save(id, fields, sections);
    await this.record(wardId, context, 'bulletin.updated', id, {
      sectionCount: sections.length,
      live: existing.status === 'Published',
    });
    return this.get(wardId, id);
  }

  async publish(
    wardId: string,
    id: string,
    context: BulletinActionContext,
  ): Promise<BulletinDetailDto> {
    const bulletin = await this.bulletins.findForWard(wardId, id);
    if (!bulletin) throw new NotFoundException('Bulletin not found.');

    const problems = bulletinPublishProblems({
      title: bulletin.title,
      sections: bulletin.sections,
    });
    if (problems.length > 0) {
      throw new BadRequestException(problems.map(describeBulletinPublishProblem).join(' '));
    }
    await this.bulletins.setStatus(id, 'Published');
    await this.record(wardId, context, 'bulletin.published', id, { language: bulletin.language });
    return this.get(wardId, id);
  }

  async unpublish(
    wardId: string,
    id: string,
    context: BulletinActionContext,
  ): Promise<BulletinDetailDto> {
    const bulletin = await this.bulletins.findForWard(wardId, id);
    if (!bulletin) throw new NotFoundException('Bulletin not found.');
    await this.bulletins.setStatus(id, 'Draft');
    await this.record(wardId, context, 'bulletin.unpublished', id, {});
    return this.get(wardId, id);
  }

  /**
   * Starts another language edition as a draft copy (same sections, to be
   * translated). Editions link to the original so readers can switch.
   */
  async copyAsLanguage(
    wardId: string,
    id: string,
    language: string,
    context: BulletinActionContext,
  ): Promise<BulletinDetailDto> {
    const source = await this.bulletins.findForWard(wardId, id);
    if (!source) throw new NotFoundException('Bulletin not found.');
    const rootId = source.translationOfId ?? source.id;
    const editions = await this.bulletins.listEditions(rootId);
    if (editions.some((edition) => edition.language === language)) {
      throw new ConflictException('This bulletin already has an edition in that language.');
    }

    const copy = await this.bulletins.create(
      wardId,
      {
        title: source.title,
        kicker: source.kicker,
        issueDate: source.issueDate,
        template: source.template,
        language,
        translationOfId: rootId,
        createdByUserId: context.actorUserId,
      },
      source.sections.map((section) => ({
        organizationId: section.organizationId,
        column: section.column,
        sortOrder: section.sortOrder,
        heading: section.heading,
        subheading: section.subheading,
        bodyHtml: section.bodyHtml,
        imageUrl: section.imageUrl,
        imageAltText: section.imageAltText,
        linkUrl: section.linkUrl,
        linkLabel: section.linkLabel,
      })),
    );
    await this.record(wardId, context, 'bulletin.edition_created', copy.id, {
      fromBulletinId: id,
      language,
    });
    return this.get(wardId, copy.id);
  }

  async archive(wardId: string, id: string, context: BulletinActionContext): Promise<void> {
    const bulletin = await this.bulletins.findForWard(wardId, id);
    if (!bulletin) throw new NotFoundException('Bulletin not found.');
    if (bulletin.status === 'Published' && !context.permissions.includes(PUBLISH_PERMISSION)) {
      throw new ForbiddenException(
        'This bulletin is live. Ask someone who can publish to remove it.',
      );
    }
    await this.bulletins.archive(id);
    await this.record(wardId, context, 'bulletin.archived', id, {
      wasLive: bulletin.status === 'Published',
    });
  }

  // --- Public (anonymous, by public slug) --------------------------------------

  async listPublic(wardId: string): Promise<PublicBulletinListResponse> {
    const rows = await this.bulletins.listPublished(wardId);
    return {
      bulletins: rows.map((row) => ({
        id: row.id,
        title: row.title,
        issueDate: fromDate(row.issueDate),
        language: row.language,
      })),
    };
  }

  async getPublic(wardId: string, id: string): Promise<PublicBulletinDto> {
    const bulletin = await this.bulletins.findPublished(wardId, id);
    if (!bulletin || !bulletin.publishedAt) throw new NotFoundException('Bulletin not found.');
    const editions = await this.bulletins.listEditions(bulletin.translationOfId ?? bulletin.id);
    return {
      id: bulletin.id,
      unitName: bulletin.ward.name,
      unitSlug: bulletin.ward.publicSlug,
      title: bulletin.title,
      kicker: bulletin.kicker,
      issueDate: fromDate(bulletin.issueDate),
      language: bulletin.language,
      template: bulletin.template,
      publishedAt: bulletin.publishedAt.toISOString(),
      sections: bulletin.sections.map((section) => {
        const { organizationId: _omit, ...rest } = this.toSectionDto(section);
        return rest;
      }),
      editions: editions
        .filter((edition) => edition.status === 'Published')
        .map((edition) => ({ id: edition.id, language: edition.language })),
    };
  }

  // --- Helpers ---------------------------------------------------------------

  private async buildSections(
    wardId: string,
    input: BulletinSectionInputParsed[],
  ): Promise<BulletinSectionRow[]> {
    const requestedOrgIds = [
      ...new Set(input.map((s) => s.organizationId).filter((v): v is string => !!v)),
    ];
    const owned = await this.organizations.filterOwnedIds(wardId, requestedOrgIds);
    if (owned.size !== requestedOrgIds.length) {
      throw new BadRequestException('One of the selected organizations is not available.');
    }

    const nextOrder: Record<'Main' | 'Side', number> = { Main: 0, Side: 0 };
    return input.map((section) => {
      const column = section.column;
      const sortOrder = nextOrder[column]++;
      const imageUrl = safeHttpUrl(section.imageUrl);
      return {
        organizationId: section.organizationId ?? null,
        column,
        sortOrder,
        heading: section.heading,
        subheading: section.subheading ?? null,
        bodyHtml: sanitizeBulletinHtml(section.bodyHtml),
        imageUrl,
        imageAltText: imageUrl ? (section.imageAltText ?? null) : null,
        linkUrl: safeHttpUrl(section.linkUrl),
        linkLabel: section.linkLabel ?? null,
      };
    });
  }

  private toSummary(bulletin: Bulletin, sectionCount: number): BulletinSummaryDto {
    return {
      id: bulletin.id,
      title: bulletin.title,
      issueDate: fromDate(bulletin.issueDate),
      language: bulletin.language,
      template: bulletin.template,
      status: bulletin.status,
      publishedAt: bulletin.publishedAt?.toISOString() ?? null,
      updatedAt: bulletin.updatedAt.toISOString(),
      sectionCount,
      translationOfId: bulletin.translationOfId,
    };
  }

  private toSectionDto(section: BulletinWithSections['sections'][number]): BulletinSectionDto {
    return {
      id: section.id,
      organizationId: section.organizationId,
      organizationName: section.organization?.name ?? null,
      column: section.column,
      sortOrder: section.sortOrder,
      heading: section.heading,
      subheading: section.subheading,
      bodyHtml: section.bodyHtml,
      imageUrl: section.imageUrl,
      imageAltText: section.imageAltText,
      linkUrl: section.linkUrl,
      linkLabel: section.linkLabel,
    };
  }

  private async toDetail(bulletin: BulletinWithSections): Promise<BulletinDetailDto> {
    const editions = await this.bulletins.listEditions(bulletin.translationOfId ?? bulletin.id);
    return {
      ...this.toSummary(bulletin, bulletin.sections.length),
      kicker: bulletin.kicker,
      sections: bulletin.sections.map((section) => this.toSectionDto(section)),
      editions: editions.map((edition) => ({
        id: edition.id,
        language: edition.language,
        status: edition.status,
      })),
      unitName: bulletin.ward.name,
      unitSlug: bulletin.ward.publicSlug,
    };
  }

  private async record(
    wardId: string,
    context: BulletinActionContext,
    action: string,
    bulletinId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action,
      entityType: 'Bulletin',
      entityId: bulletinId,
      metadata,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }
}
