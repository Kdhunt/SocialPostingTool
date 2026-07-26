import { Inject, Injectable } from '@nestjs/common';
import type { PersonRelationship, RelationshipType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { RelationshipPair } from '@ward-comms/domain';

/**
 * Prisma-backed repository for PersonRelationship. Persists the
 * forward + reciprocal row pair built by
 * `@ward-comms/domain`'s `buildRelationshipPair` atomically, so the two
 * directions of a family relationship never fall out of sync.
 */
@Injectable()
export class RelationshipRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async createPair(pair: RelationshipPair): Promise<PersonRelationship[]> {
    return this.prisma.client.$transaction(async (tx) => {
      const rows: PersonRelationship[] = [];
      rows.push(
        await tx.personRelationship.create({
          data: {
            personId: pair.personId,
            relatedPersonId: pair.relatedPersonId,
            relationshipType: pair.relationshipType as RelationshipType,
          },
        }),
      );
      if (pair.inverse) {
        rows.push(
          await tx.personRelationship.create({
            data: {
              personId: pair.inverse.personId,
              relatedPersonId: pair.inverse.relatedPersonId,
              relationshipType: pair.inverse.relationshipType as RelationshipType,
            },
          }),
        );
      }
      return rows;
    });
  }

  async findById(id: string): Promise<PersonRelationship | null> {
    return this.prisma.client.personRelationship.findUnique({ where: { id } });
  }

  /**
   * Archives a relationship and, when a reciprocal row exists (matching
   * relatedPersonId/personId swapped), archives it too — so ending a
   * marriage (divorce) or a guardianship ends both directions together
   * rather than leaving a dangling one-sided row.
   */
  async archivePairFor(relationship: PersonRelationship): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.personRelationship.update({ where: { id: relationship.id }, data: { archivedAt: new Date() } });

      await tx.personRelationship.updateMany({
        where: {
          personId: relationship.relatedPersonId,
          relatedPersonId: relationship.personId,
          archivedAt: null,
        },
        data: { archivedAt: new Date() },
      });
    });
  }
}
