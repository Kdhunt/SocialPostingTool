import { Inject, Injectable } from '@nestjs/common';
import type { HouseholdMembership, HouseholdRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

/**
 * Prisma-backed repository for HouseholdMembership. Household residency
 * (this table) is intentionally kept separate from family relationship
 * (PersonRelationship) — see schema.prisma comment — so this repository
 * never touches PersonRelationship rows.
 */
@Injectable()
export class HouseholdMembershipRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async findCurrentForPerson(personId: string): Promise<HouseholdMembership[]> {
    return this.prisma.client.householdMembership.findMany({
      where: { personId, endedAt: null },
    });
  }

  async findById(id: string): Promise<HouseholdMembership | null> {
    return this.prisma.client.householdMembership.findUnique({ where: { id } });
  }

  /**
   * Adds a person to a household, reusing an existing (previously ended)
   * membership row for the same household/person pair instead of
   * inserting a duplicate (see schema.prisma `@@unique([personId,
   * householdId])`). When `endOtherCurrentMemberships` is set, any other
   * currently-active membership for this person is ended first — used
   * when a person moves between households rather than temporarily
   * belonging to two (e.g. joint custody, which should NOT set this
   * flag).
   */
  async addOrReactivate(
    personId: string,
    householdId: string,
    role: HouseholdRole,
    endOtherCurrentMemberships: boolean,
  ): Promise<HouseholdMembership> {
    return this.prisma.client.$transaction(async (tx) => {
      if (endOtherCurrentMemberships) {
        await tx.householdMembership.updateMany({
          where: { personId, endedAt: null, householdId: { not: householdId } },
          data: { endedAt: new Date() },
        });
      }

      const existing = await tx.householdMembership.findUnique({
        where: { personId_householdId: { personId, householdId } },
      });

      if (existing) {
        return tx.householdMembership.update({
          where: { id: existing.id },
          data: { endedAt: null, householdRole: role, startedAt: existing.endedAt ? new Date() : existing.startedAt },
        });
      }

      return tx.householdMembership.create({
        data: { personId, householdId, householdRole: role },
      });
    });
  }

  async end(id: string): Promise<void> {
    await this.prisma.client.householdMembership.update({ where: { id }, data: { endedAt: new Date() } });
  }
}
