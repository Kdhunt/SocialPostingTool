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
  async listEditions(rootId: string): Promise<Bulletin[]> {
    return this.prisma.client.bulletin.findMany({
      where: { archivedAt: null, OR: [{ id: rootId }, { translationOfId: rootId }] },
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

  /** Updates the header fields and replaces all sections, atomically. */
  async save(id: string, fields: BulletinFields, sections: BulletinSectionRow[]): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.bulletin.update({ where: { id }, data: fields });
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
