import { Inject, Injectable } from '@nestjs/common';
import type { ContactConsent, ContactMethod, ConsentStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateContactMethodInput {
  personId: string;
  type: 'Email' | 'Phone';
  value: string;
  normalizedValue: string | null;
  isPrimary: boolean;
}

/**
 * Prisma-backed repository for ContactMethod and its associated
 * ContactConsent row. Consent defaults to `Unknown` at the database level
 * (schema.prisma) and is NEVER set to `Granted` here — only an explicit
 * `DirectoryService.setConsent` call (itself only reachable via an
 * explicit API request) can grant consent (see AGENTS.md #8).
 */
@Injectable()
export class ContactMethodRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForPerson(personId: string): Promise<(ContactMethod & { consent: ContactConsent | null })[]> {
    return this.prisma.client.contactMethod.findMany({
      where: { personId },
      include: { consent: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Bulk fetch for delivery expansion — excludes archived methods. */
  async listForPersons(personIds: string[]): Promise<(ContactMethod & { consent: ContactConsent | null })[]> {
    if (personIds.length === 0) return [];
    return this.prisma.client.contactMethod.findMany({
      where: { personId: { in: personIds }, archivedAt: null },
      include: { consent: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findById(id: string): Promise<ContactMethod | null> {
    return this.prisma.client.contactMethod.findUnique({ where: { id } });
  }

  async create(input: CreateContactMethodInput): Promise<ContactMethod> {
    return this.prisma.client.$transaction(async (tx) => {
      if (input.isPrimary) {
        await tx.contactMethod.updateMany({
          where: { personId: input.personId, type: input.type, isPrimary: true },
          data: { isPrimary: false },
        });
      }
      return tx.contactMethod.create({
        data: {
          personId: input.personId,
          type: input.type,
          value: input.value,
          normalizedValue: input.normalizedValue,
          isPrimary: input.isPrimary,
        },
      });
    });
  }

  async update(
    id: string,
    input: { value?: string; normalizedValue?: string | null; isPrimary?: boolean },
  ): Promise<ContactMethod> {
    return this.prisma.client.$transaction(async (tx) => {
      if (input.isPrimary) {
        const method = await tx.contactMethod.findUniqueOrThrow({ where: { id } });
        await tx.contactMethod.updateMany({
          where: { personId: method.personId, type: method.type, isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
      }
      return tx.contactMethod.update({ where: { id }, data: input });
    });
  }

  async archive(id: string): Promise<void> {
    await this.prisma.client.contactMethod.update({ where: { id }, data: { archivedAt: new Date() } });
  }

  async upsertConsent(
    contactMethodId: string,
    status: ConsentStatus,
    source: string | null,
    recordedByUserId: string | null,
  ): Promise<ContactConsent> {
    const now = new Date();
    return this.prisma.client.contactConsent.upsert({
      where: { contactMethodId },
      create: {
        contactMethodId,
        status,
        source,
        recordedByUserId,
        grantedAt: status === 'Granted' ? now : null,
        revokedAt: status === 'Denied' || status === 'Withdrawn' ? now : null,
      },
      update: {
        status,
        source,
        recordedByUserId,
        grantedAt: status === 'Granted' ? now : undefined,
        revokedAt: status === 'Denied' || status === 'Withdrawn' ? now : null,
      },
    });
  }
}
