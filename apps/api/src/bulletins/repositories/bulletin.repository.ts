import { Inject, Injectable } from '@nestjs/common';
import type { Bulletin, BulletinColumn, BulletinTemplate, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

const DETAIL_INCLUDE = {
  sections: {
    orderBy: [{ column: 'asc' }, { sortOrder: 'asc' }],
    include: { organization: { select: { name: true } } },
  },
  ward: { select: { name: true, publicSlug: true } },
} satisfies Prisma.BulletinInclude;

export type BulletinWithSections = Prisma.BulletinGetPayload<{ include: typeof DETAIL_INCLUDE }>;

export interface BulletinSectionRow {
  organizationId: string | null;
  column: BulletinColumn;
  sortOrder: number;
  heading: string;
  subheading: string | null;
  bodyHtml: string;
  imageUrl: string | null;
  imageAltText: string | null;
  linkUrl: string | null;
  linkLabel: string | null;
}

export interface BulletinFields {
  title: string;
  kicker: string | null;
  issueDate: Date;
  template: BulletinTemplate;
  language: string;
}

/** The bulletin changed since the editor loaded it (another save, or a publish). */
export class BulletinVersionConflictError extends Error {}

/** Another edition of the same bulletin already uses that language. */
export class BulletinLanguageConflictError extends Error {}

/** Serializes checks that span rows (one language per edition set). */
async function lockKey(tx: Prisma.TransactionClient, key: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
}

async function assertLanguageFree(
  tx: Prisma.TransactionClient,
  wardId: string,
  rootId: string,
  language: string,
  exceptId: string | null,
): Promise<void> {
  const clash = await tx.bulletin.findFirst({
    where: {
      wardId,
      archivedAt: null,
      language,
      OR: [{ id: rootId }, { translationOfId: rootId }],
      ...(exceptId ? { NOT: { id: exceptId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new BulletinLanguageConflictError();
}

@Injectable()
export class BulletinRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForWard(wardId: string): Promise<Array<Bulletin & { _count: { sections: number } }>> {
    return this.prisma.client.bulletin.findMany({
      where: { wardId, archivedAt: null },
      orderBy: [{ issueDate: 'desc' }, { updatedAt: 'desc' }],
      include: { _count: { select: { sections: true } } },
      take: 200,
    });
  }

  async findForWard(wardId: string, id: string): Promise<BulletinWithSections | null> {
    return this.prisma.client.bulletin.findFirst({
      where: { id, wardId, archivedAt: null },
      include: DETAIL_INCLUDE,
    });
  }

  async findPublished(wardId: string, id: string): Promise<BulletinWithSections | null> {
    return this.prisma.client.bulletin.findFirst({
      where: { id, wardId, archivedAt: null, status: 'Published' },
      include: DETAIL_INCLUDE,
    });
  }

  async listPublished(wardId: string, take = 50): Promise<Bulletin[]> {
    return this.prisma.client.bulletin.findMany({
      where: { wardId, archivedAt: null, status: 'Published' },
      orderBy: [{ issueDate: 'desc' }, { publishedAt: 'desc' }],
      take,
    });
  }

  /** The original and every translated edition, excluding archived ones. */
  async listEditions(wardId: string, rootId: string): Promise<Bulletin[]> {
    return this.prisma.client.bulletin.findMany({
      where: { wardId, archivedAt: null, OR: [{ id: rootId }, { translationOfId: rootId }] },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(
    wardId: string,
    fields: BulletinFields & { translationOfId?: string | null; createdByUserId: string },
    sections: BulletinSectionRow[] = [],
  ): Promise<Bulletin> {
    return this.prisma.client.bulletin.create({
      data: {
        wardId,
        ...fields,
        sections: sections.length > 0 ? { createMany: { data: sections } } : undefined,
      },
    });
  }

  /** Starts a translated edition, refusing a language the edition set already has. */
  async createEdition(
    wardId: string,
    rootId: string,
    fields: BulletinFields & { createdByUserId: string },
    sections: BulletinSectionRow[],
  ): Promise<Bulletin> {
    return this.prisma.client.$transaction(async (tx) => {
      await lockKey(tx, `bulletin-editions:${rootId}`);
      await assertLanguageFree(tx, wardId, rootId, fields.language, null);
      return tx.bulletin.create({
        data: {
          wardId,
          ...fields,
          translationOfId: rootId,
          sections: sections.length > 0 ? { createMany: { data: sections } } : undefined,
        },
      });
    });
  }

  /**
   * Updates the header fields and replaces all sections, atomically, but only
   * if the bulletin is still at `expectedUpdatedAt` (nobody saved or
   * published it in between) and the language stays unique among editions.
   */
  async save(
    target: { id: string; wardId: string; rootId: string; expectedUpdatedAt: Date },
    fields: BulletinFields,
    sections: BulletinSectionRow[],
  ): Promise<void> {
    const { id } = target;
    await this.prisma.client.$transaction(async (tx) => {
      await lockKey(tx, `bulletin-editions:${target.rootId}`);
      await assertLanguageFree(tx, target.wardId, target.rootId, fields.language, id);
      const updated = await tx.bulletin.updateMany({
        where: { id, updatedAt: target.expectedUpdatedAt, archivedAt: null },
        data: fields,
      });
      if (updated.count === 0) throw new BulletinVersionConflictError();
      await tx.bulletinSection.deleteMany({ where: { bulletinId: id } });
      if (sections.length > 0) {
        await tx.bulletinSection.createMany({
          data: sections.map((section) => ({ ...section, bulletinId: id })),
        });
      }
    });
  }

  async setStatus(id: string, status: 'Draft' | 'Published'): Promise<void> {
    await this.prisma.client.bulletin.update({
      where: { id },
      data: status === 'Published' ? { status, publishedAt: new Date() } : { status },
    });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.client.bulletin.update({ where: { id }, data: { archivedAt: new Date() } });
  }
}
