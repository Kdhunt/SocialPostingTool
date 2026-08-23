import { Inject, Injectable } from '@nestjs/common';
import type { Household, HouseholdRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export type HouseholdWithMembers = Household & {
  memberships: {
    personId: string;
    householdRole: HouseholdRole;
    endedAt: Date | null;
    person: { firstName: string; lastName: string; preferredName: string | null; dateOfBirth: Date | null };
  }[];
};

export interface CreateHouseholdInput {
  wardId: string;
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}

export type UpdateHouseholdInput = Partial<Omit<CreateHouseholdInput, 'wardId'>>;

/**
 * Prisma-backed repository for Household. Always scoped by `wardId` for
 * list/lookup so one ward's households can never leak into another's
 * queries or be edited cross-tenant.
 */
@Injectable()
export class HouseholdRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async listForWard(wardId: string, includeInactive = false): Promise<HouseholdWithMembers[]> {
    return this.prisma.client.household.findMany({
      where: { wardId, archivedAt: includeInactive ? undefined : null },
      include: {
        memberships: {
          where: { endedAt: null },
          include: { person: { select: { firstName: true, lastName: true, preferredName: true, dateOfBirth: true } } },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async findByIdForWard(wardId: string, householdId: string): Promise<HouseholdWithMembers | null> {
    return this.prisma.client.household.findFirst({
      where: { id: householdId, wardId },
      include: {
        memberships: {
          include: { person: { select: { firstName: true, lastName: true, preferredName: true, dateOfBirth: true } } },
          orderBy: { startedAt: 'desc' },
        },
      },
    });
  }

  async create(input: CreateHouseholdInput): Promise<Household> {
    return this.prisma.client.household.create({
      data: {
        wardId: input.wardId,
        name: input.name,
        addressLine1: input.addressLine1 ?? null,
        addressLine2: input.addressLine2 ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
        postalCode: input.postalCode ?? null,
        country: input.country ?? null,
      },
    });
  }

  async update(householdId: string, input: UpdateHouseholdInput): Promise<Household> {
    return this.prisma.client.household.update({ where: { id: householdId }, data: input });
  }

  async archive(householdId: string): Promise<void> {
    await this.prisma.client.household.update({ where: { id: householdId }, data: { archivedAt: new Date() } });
  }
}
