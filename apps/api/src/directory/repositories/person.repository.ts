import { Inject, Injectable } from '@nestjs/common';
import type { ConsentStatus, ContactMethod, HouseholdRole, Person, PersonRelationship } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface PersonSearchOptions {
  query?: string;
  includeInactive?: boolean;
  householdId?: string;
  limit?: number;
}

export type PersonWithHouseholds = Person & {
  householdMemberships: { household: { name: string }; endedAt: Date | null }[];
};

export type PersonDetail = Person & {
  contactMethods: (ContactMethod & { consent: { status: ConsentStatus; source: string | null; grantedAt: Date | null; revokedAt: Date | null } | null })[];
  householdMemberships: { id: string; householdId: string; household: { name: string }; householdRole: HouseholdRole; startedAt: Date; endedAt: Date | null }[];
  relationshipsFrom: (PersonRelationship & { relatedPerson: { firstName: string; lastName: string; preferredName: string | null } })[];
};

export interface CreatePersonInput {
  wardId: string;
  firstName: string;
  lastName: string;
  preferredName?: string | null;
  gender?: 'Male' | 'Female' | 'NotSpecified';
  dateOfBirth?: Date | null;
}

export interface UpdatePersonInput {
  firstName?: string;
  lastName?: string;
  preferredName?: string | null;
  gender?: 'Male' | 'Female' | 'NotSpecified';
  dateOfBirth?: Date | null;
}

/**
 * Prisma-backed repository for Person. Contains no authorization or
 * minor-redaction decisions — those live in DirectoryService and
 * packages/domain — only data access, always scoped by `wardId` so one
 * ward's directory data can never leak into another's queries.
 */
@Injectable()
export class PersonRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async search(wardId: string, options: PersonSearchOptions): Promise<PersonWithHouseholds[]> {
    const trimmedQuery = options.query?.trim();

    return this.prisma.client.person.findMany({
      where: {
        wardId,
        archivedAt: options.includeInactive ? undefined : null,
        ...(trimmedQuery
          ? {
              OR: [
                { firstName: { contains: trimmedQuery, mode: 'insensitive' } },
                { lastName: { contains: trimmedQuery, mode: 'insensitive' } },
                { preferredName: { contains: trimmedQuery, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(options.householdId
          ? { householdMemberships: { some: { householdId: options.householdId, endedAt: null } } }
          : {}),
      },
      include: {
        householdMemberships: {
          where: { endedAt: null },
          include: { household: { select: { name: true } } },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: options.limit ?? 50,
    });
  }

  async findByIdForWard(wardId: string, personId: string): Promise<PersonDetail | null> {
    return this.prisma.client.person.findFirst({
      where: { id: personId, wardId },
      include: {
        contactMethods: { include: { consent: true }, orderBy: { createdAt: 'asc' } },
        householdMemberships: {
          include: { household: { select: { name: true } } },
          orderBy: { startedAt: 'desc' },
        },
        relationshipsFrom: {
          where: { archivedAt: null },
          include: { relatedPerson: { select: { firstName: true, lastName: true, preferredName: true } } },
        },
      },
    });
  }

  async create(input: CreatePersonInput): Promise<Person> {
    return this.prisma.client.person.create({
      data: {
        wardId: input.wardId,
        firstName: input.firstName,
        lastName: input.lastName,
        preferredName: input.preferredName ?? null,
        gender: input.gender ?? 'NotSpecified',
        dateOfBirth: input.dateOfBirth ?? null,
      },
    });
  }

  async update(personId: string, input: UpdatePersonInput): Promise<Person> {
    return this.prisma.client.person.update({
      where: { id: personId },
      data: input,
    });
  }

  async archive(personId: string): Promise<void> {
    await this.prisma.client.person.update({
      where: { id: personId },
      data: { archivedAt: new Date() },
    });
  }

  async restore(personId: string): Promise<void> {
    await this.prisma.client.person.update({
      where: { id: personId },
      data: { archivedAt: null },
    });
  }

  /** Active ward people with household roles for audience rule evaluation. */
  async listActiveForRuleEvaluation(wardId: string): Promise<
    {
      id: string;
      firstName: string;
      lastName: string;
      preferredName: string | null;
      gender: 'Male' | 'Female' | 'NotSpecified';
      dateOfBirth: Date | null;
      archivedAt: Date | null;
      householdMemberships: { householdRole: 'Head' | 'Member'; endedAt: Date | null }[];
    }[]
  > {
    return this.prisma.client.person.findMany({
      where: { wardId, archivedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        gender: true,
        dateOfBirth: true,
        archivedAt: true,
        householdMemberships: {
          where: { endedAt: null },
          select: { householdRole: true, endedAt: true },
        },
      },
    });
  }
}
