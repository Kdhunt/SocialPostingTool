import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { ConsentStatus, Household, HouseholdRole, Person } from '@prisma/client';
import {
  assertNotSelfRelationship,
  buildRelationshipPair,
  canViewRestrictedMinorFields,
  isMinor,
  normalizeEmail,
  normalizePhone,
  SelfRelationshipError,
  type RelationshipType,
} from '@ward-comms/domain';
import type {
  CreateContactMethodRequest,
  CreateHouseholdRequest,
  CreatePersonRequest,
  CreateRelationshipRequest,
  HouseholdDetailDto,
  PersonDetailDto,
  PersonSummaryDto,
  UpdateConsentRequest,
  UpdateContactMethodRequest,
  UpdateHouseholdRequest,
  UpdatePersonRequest,
} from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import {
  ContactMethodRepository,
} from './repositories/contact-method.repository.js';
import { HouseholdMembershipRepository } from './repositories/household-membership.repository.js';
import { HouseholdRepository, type HouseholdWithMembers } from './repositories/household.repository.js';
import { PersonRepository, type PersonDetail, type PersonWithHouseholds } from './repositories/person.repository.js';
import { RelationshipRepository } from './repositories/relationship.repository.js';

export interface DirectoryActionContext {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

export const MINORS_CONTACT_READ_PERMISSION = 'minors.contact.read';

/**
 * Orchestrates the Phase 5 directory (people, households, relationships,
 * contact methods, consent). Applies the pure domain rules from
 * `@ward-comms/domain` (minor-data restriction, self-relationship checks,
 * contact normalization, primary-contact-method invariants) and records
 * an AuditEvent for every mutation. Never infers consent (AGENTS.md #8):
 * `setConsent` is the only way a contact method's consent status changes,
 * and it always requires an explicit status from the caller.
 */
@Injectable()
export class DirectoryService {
  constructor(
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(HouseholdRepository) private readonly households: HouseholdRepository,
    @Inject(ContactMethodRepository) private readonly contactMethods: ContactMethodRepository,
    @Inject(RelationshipRepository) private readonly relationships: RelationshipRepository,
    @Inject(HouseholdMembershipRepository) private readonly memberships: HouseholdMembershipRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // --- People ---------------------------------------------------------------

  async searchPeople(
    wardId: string,
    options: { query?: string; includeInactive?: boolean; householdId?: string; limit?: number },
  ): Promise<PersonSummaryDto[]> {
    const results = await this.people.search(wardId, options);
    return results.map((person) => this.toPersonSummary(person));
  }

  async getPerson(
    wardId: string,
    personId: string,
    viewerHasMinorContactPermission: boolean,
  ): Promise<PersonDetailDto> {
    const person = await this.people.findByIdForWard(wardId, personId);
    if (!person) {
      throw new NotFoundException('Person not found.');
    }
    return this.toPersonDetail(person, viewerHasMinorContactPermission);
  }

  async createPerson(
    wardId: string,
    input: CreatePersonRequest,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    const person = await this.people.create({
      wardId,
      firstName: input.firstName,
      lastName: input.lastName,
      preferredName: input.preferredName ?? null,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.person.created',
      entityType: 'Person',
      entityId: person.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, person.id, true);
  }

  async updatePerson(
    wardId: string,
    personId: string,
    input: UpdatePersonRequest,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);

    await this.people.update(personId, {
      firstName: input.firstName,
      lastName: input.lastName,
      preferredName: input.preferredName,
      gender: input.gender,
      dateOfBirth: input.dateOfBirth === undefined ? undefined : input.dateOfBirth ? new Date(input.dateOfBirth) : null,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.person.updated',
      entityType: 'Person',
      entityId: personId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  async archivePerson(wardId: string, personId: string, context: DirectoryActionContext): Promise<void> {
    await this.assertPersonInWard(wardId, personId);
    await this.people.archive(personId);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.person.archived',
      entityType: 'Person',
      entityId: personId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async restorePerson(wardId: string, personId: string, context: DirectoryActionContext): Promise<void> {
    await this.assertPersonInWard(wardId, personId);
    await this.people.restore(personId);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.person.restored',
      entityType: 'Person',
      entityId: personId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  // --- Contact methods & consent ----------------------------------------------

  async addContactMethod(
    wardId: string,
    personId: string,
    input: CreateContactMethodRequest,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);
    const normalizedValue = this.normalizeContactValue(input.type, input.value);

    const created = await this.contactMethods.create({
      personId,
      type: input.type,
      value: input.value,
      normalizedValue,
      isPrimary: input.isPrimary ?? false,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.contact_method.added',
      entityType: 'ContactMethod',
      entityId: created.id,
      metadata: { type: input.type },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  async updateContactMethod(
    wardId: string,
    personId: string,
    contactMethodId: string,
    input: UpdateContactMethodRequest,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);
    const method = await this.assertContactMethodBelongsToPerson(contactMethodId, personId);

    const normalizedValue = input.value ? this.normalizeContactValue(method.type, input.value) : undefined;

    await this.contactMethods.update(contactMethodId, {
      value: input.value,
      normalizedValue,
      isPrimary: input.isPrimary,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.contact_method.updated',
      entityType: 'ContactMethod',
      entityId: contactMethodId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  async archiveContactMethod(
    wardId: string,
    personId: string,
    contactMethodId: string,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);
    await this.assertContactMethodBelongsToPerson(contactMethodId, personId);
    await this.contactMethods.archive(contactMethodId);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.contact_method.archived',
      entityType: 'ContactMethod',
      entityId: contactMethodId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  /**
   * The ONLY way a contact method's consent status changes. Always
   * requires an explicit status supplied by the caller — consent is never
   * derived from audience membership or any other record (AGENTS.md #8).
   */
  async setConsent(
    wardId: string,
    personId: string,
    contactMethodId: string,
    input: UpdateConsentRequest,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);
    await this.assertContactMethodBelongsToPerson(contactMethodId, personId);

    await this.contactMethods.upsertConsent(
      contactMethodId,
      input.status as ConsentStatus,
      input.source ?? null,
      context.actorUserId,
    );

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.consent.updated',
      entityType: 'ContactMethod',
      entityId: contactMethodId,
      metadata: { status: input.status },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  // --- Relationships -----------------------------------------------------------

  async addRelationship(
    wardId: string,
    personId: string,
    input: CreateRelationshipRequest,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);
    await this.assertPersonInWard(wardId, input.relatedPersonId);

    try {
      assertNotSelfRelationship(personId, input.relatedPersonId);
    } catch (error) {
      if (error instanceof SelfRelationshipError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const pair = buildRelationshipPair(
      personId,
      input.relatedPersonId,
      input.relationshipType as RelationshipType,
      input.inverseRelationshipType as RelationshipType | undefined,
    );
    await this.relationships.createPair(pair);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.relationship.added',
      entityType: 'PersonRelationship',
      entityId: personId,
      metadata: { relatedPersonId: input.relatedPersonId, relationshipType: input.relationshipType },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  async archiveRelationship(
    wardId: string,
    personId: string,
    relationshipId: string,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);
    const relationship = await this.relationships.findById(relationshipId);
    if (!relationship || relationship.personId !== personId) {
      throw new NotFoundException('Relationship not found.');
    }

    await this.relationships.archivePairFor(relationship);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.relationship.archived',
      entityType: 'PersonRelationship',
      entityId: relationshipId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  // --- Household membership -----------------------------------------------------

  async addHouseholdMembership(
    wardId: string,
    personId: string,
    householdId: string,
    role: HouseholdRole | undefined,
    endOtherCurrentMemberships: boolean,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);
    const household = await this.households.findByIdForWard(wardId, householdId);
    if (!household) {
      throw new NotFoundException('Household not found.');
    }

    await this.memberships.addOrReactivate(personId, householdId, role ?? 'Member', endOtherCurrentMemberships);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.household_membership.added',
      entityType: 'HouseholdMembership',
      entityId: personId,
      metadata: { householdId, role: role ?? 'Member' },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  async endHouseholdMembership(
    wardId: string,
    personId: string,
    membershipId: string,
    context: DirectoryActionContext,
  ): Promise<PersonDetailDto> {
    await this.assertPersonInWard(wardId, personId);
    const membership = await this.memberships.findById(membershipId);
    if (!membership || membership.personId !== personId) {
      throw new NotFoundException('Household membership not found.');
    }

    await this.memberships.end(membershipId);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.household_membership.ended',
      entityType: 'HouseholdMembership',
      entityId: membershipId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getPerson(wardId, personId, true);
  }

  // --- Households ----------------------------------------------------------------

  async listHouseholds(wardId: string, includeInactive: boolean): Promise<HouseholdDetailDto[]> {
    const results = await this.households.listForWard(wardId, includeInactive);
    return results.map((household) => this.toHouseholdDetail(household));
  }

  async getHousehold(wardId: string, householdId: string): Promise<HouseholdDetailDto> {
    const household = await this.households.findByIdForWard(wardId, householdId);
    if (!household) {
      throw new NotFoundException('Household not found.');
    }
    return this.toHouseholdDetail(household);
  }

  async createHousehold(
    wardId: string,
    input: CreateHouseholdRequest,
    context: DirectoryActionContext,
  ): Promise<HouseholdDetailDto> {
    const household = await this.households.create({ wardId, ...input });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.household.created',
      entityType: 'Household',
      entityId: household.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getHousehold(wardId, household.id);
  }

  async updateHousehold(
    wardId: string,
    householdId: string,
    input: UpdateHouseholdRequest,
    context: DirectoryActionContext,
  ): Promise<HouseholdDetailDto> {
    await this.assertHouseholdInWard(wardId, householdId);
    await this.households.update(householdId, input);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.household.updated',
      entityType: 'Household',
      entityId: householdId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.getHousehold(wardId, householdId);
  }

  async archiveHousehold(wardId: string, householdId: string, context: DirectoryActionContext): Promise<void> {
    await this.assertHouseholdInWard(wardId, householdId);
    await this.households.archive(householdId);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'directory.household.archived',
      entityType: 'Household',
      entityId: householdId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  // --- Internal helpers -------------------------------------------------------------

  private async assertPersonInWard(wardId: string, personId: string): Promise<Person> {
    const person = await this.people.findByIdForWard(wardId, personId);
    if (!person) {
      throw new NotFoundException('Person not found.');
    }
    return person;
  }

  private async assertHouseholdInWard(wardId: string, householdId: string): Promise<Household> {
    const household = await this.households.findByIdForWard(wardId, householdId);
    if (!household) {
      throw new NotFoundException('Household not found.');
    }
    return household;
  }

  private async assertContactMethodBelongsToPerson(
    contactMethodId: string,
    personId: string,
  ): Promise<{ id: string; personId: string; type: 'Email' | 'Phone' }> {
    const method = await this.contactMethods.findById(contactMethodId);
    if (!method || method.personId !== personId) {
      throw new ForbiddenException('This contact method does not belong to the specified person.');
    }
    return method;
  }

  private normalizeContactValue(type: 'Email' | 'Phone', value: string): string {
    const normalized = type === 'Email' ? normalizeEmail(value) : normalizePhone(value);
    if (!normalized) {
      throw new BadRequestException(
        type === 'Email' ? 'Not a valid email address.' : 'Not a valid phone number.',
      );
    }
    return normalized;
  }

  private toPersonSummary(person: PersonWithHouseholds): PersonSummaryDto {
    const currentMembership = person.householdMemberships.find((membership) => membership.endedAt === null);
    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      preferredName: person.preferredName,
      gender: person.gender,
      isMinor: isMinor(person.dateOfBirth),
      isActive: person.archivedAt === null,
      primaryHouseholdName: currentMembership?.household.name ?? null,
    };
  }

  private toPersonDetail(person: PersonDetail, viewerHasMinorContactPermission: boolean): PersonDetailDto {
    const personIsMinor = isMinor(person.dateOfBirth);
    const restricted = !canViewRestrictedMinorFields({
      dateOfBirth: person.dateOfBirth,
      viewerHasMinorContactPermission,
    });

    return {
      id: person.id,
      firstName: person.firstName,
      lastName: person.lastName,
      preferredName: person.preferredName,
      gender: person.gender,
      dateOfBirth: restricted ? null : (person.dateOfBirth?.toISOString().slice(0, 10) ?? null),
      isMinor: personIsMinor,
      isActive: person.archivedAt === null,
      restricted,
      contactMethods: restricted
        ? []
        : person.contactMethods.map((method) => ({
            id: method.id,
            type: method.type,
            value: method.value,
            isPrimary: method.isPrimary,
            archivedAt: method.archivedAt?.toISOString() ?? null,
            consent: method.consent
              ? {
                  status: method.consent.status,
                  source: method.consent.source,
                  grantedAt: method.consent.grantedAt?.toISOString() ?? null,
                  revokedAt: method.consent.revokedAt?.toISOString() ?? null,
                }
              : null,
          })),
      householdMemberships: person.householdMemberships.map((membership) => ({
        id: membership.id,
        householdId: membership.householdId,
        householdName: membership.household.name,
        householdRole: membership.householdRole,
        startedAt: membership.startedAt.toISOString(),
        endedAt: membership.endedAt?.toISOString() ?? null,
      })),
      relationships: person.relationshipsFrom.map((relationship) => ({
        id: relationship.id,
        relatedPersonId: relationship.relatedPersonId,
        relatedPersonDisplayName:
          relationship.relatedPerson.preferredName ??
          `${relationship.relatedPerson.firstName} ${relationship.relatedPerson.lastName}`,
        relationshipType: relationship.relationshipType,
        startedAt: relationship.startedAt.toISOString(),
        archivedAt: relationship.archivedAt?.toISOString() ?? null,
      })),
      createdAt: person.createdAt.toISOString(),
      updatedAt: person.updatedAt.toISOString(),
    };
  }

  private toHouseholdDetail(household: HouseholdWithMembers): HouseholdDetailDto {
    return {
      id: household.id,
      name: household.name,
      addressLine1: household.addressLine1,
      addressLine2: household.addressLine2,
      city: household.city,
      state: household.state,
      postalCode: household.postalCode,
      country: household.country,
      isActive: household.archivedAt === null,
      members: household.memberships
        .filter((membership) => membership.endedAt === null)
        .map((membership) => ({
          personId: membership.personId,
          displayName:
            membership.person.preferredName ?? `${membership.person.firstName} ${membership.person.lastName}`,
          householdRole: membership.householdRole,
          isMinor: isMinor(membership.person.dateOfBirth),
        })),
      createdAt: household.createdAt.toISOString(),
      updatedAt: household.updatedAt.toISOString(),
    };
  }
}
