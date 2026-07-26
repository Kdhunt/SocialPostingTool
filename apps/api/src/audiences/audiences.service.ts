import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type CommunicationChannel } from '@prisma/client';
import { checkAudienceSafeToDelete, isDuplicateMembership, isMinor, mergeAudienceMemberships } from '@ward-comms/domain';
import type {
  AddAudienceDestinationRequest,
  AddAudienceMemberRequest,
  AudienceGroupDetailDto,
  AudienceGroupSummaryDto,
  AudiencePreviewResponse,
  CommunicationDestinationDto,
  CreateAudienceGroupRequest,
  CreateCommunicationDestinationRequest,
  UpdateAudienceGroupRequest,
} from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import {
  AudienceGroupRepository,
  type AudienceGroupWithCounts,
  type AudienceGroupWithDetails,
} from './repositories/audience-group.repository.js';
import { AudienceMemberRepository } from './repositories/audience-member.repository.js';
import { AudienceDestinationRepository } from './repositories/audience-destination.repository.js';
import { CommunicationDestinationRepository } from './repositories/communication-destination.repository.js';
import { PersonRepository } from '../directory/repositories/person.repository.js';

export interface AudienceActionContext {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Orchestrates the Phase 6 audience groups and communication
 * destinations. No audience group name is ever hardcoded here — a ward
 * names its own groups through `CreateAudienceGroupRequest.name`
 * (phases/06-audiences.md).
 */
@Injectable()
export class AudiencesService {
  constructor(
    @Inject(AudienceGroupRepository) private readonly groups: AudienceGroupRepository,
    @Inject(AudienceMemberRepository) private readonly members: AudienceMemberRepository,
    @Inject(AudienceDestinationRepository) private readonly audienceDestinations: AudienceDestinationRepository,
    @Inject(CommunicationDestinationRepository) private readonly destinations: CommunicationDestinationRepository,
    @Inject(PersonRepository) private readonly people: PersonRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  // --- Audience groups --------------------------------------------------------

  async search(wardId: string, options: { query?: string; includeArchived?: boolean }): Promise<AudienceGroupSummaryDto[]> {
    const results = await this.groups.search(wardId, options);
    return results.map((group) => this.toSummary(group));
  }

  async get(wardId: string, id: string): Promise<AudienceGroupDetailDto> {
    const group = await this.assertGroupInWard(wardId, id);
    return this.toDetail(group);
  }

  async create(
    wardId: string,
    input: CreateAudienceGroupRequest,
    context: AudienceActionContext,
  ): Promise<AudienceGroupDetailDto> {
    const existing = await this.groups.findByNameForWard(wardId, input.name);
    if (existing) {
      throw new ConflictException('An audience group with this name already exists.');
    }

    const group = await this.groups.create({ wardId, name: input.name, description: input.description });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.group.created',
      entityType: 'AudienceGroup',
      entityId: group.id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, group.id);
  }

  /** Handles both rename (name change) and description edits through one endpoint. */
  async update(
    wardId: string,
    id: string,
    input: UpdateAudienceGroupRequest,
    context: AudienceActionContext,
  ): Promise<AudienceGroupDetailDto> {
    await this.assertGroupInWard(wardId, id);

    if (input.name) {
      const existing = await this.groups.findByNameForWard(wardId, input.name);
      if (existing && existing.id !== id) {
        throw new ConflictException('An audience group with this name already exists.');
      }
    }

    await this.groups.update(id, input);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.group.updated',
      entityType: 'AudienceGroup',
      entityId: id,
      metadata: { renamedTo: input.name },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, id);
  }

  async archive(wardId: string, id: string, context: AudienceActionContext): Promise<void> {
    await this.assertGroupInWard(wardId, id);
    await this.groups.archive(id);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.group.archived',
      entityType: 'AudienceGroup',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async restore(wardId: string, id: string, context: AudienceActionContext): Promise<void> {
    await this.assertGroupInWard(wardId, id);
    await this.groups.restore(id);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.group.restored',
      entityType: 'AudienceGroup',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  /** Physically deletes the group only when `checkAudienceSafeToDelete` allows it; otherwise the caller should archive instead. */
  async delete(wardId: string, id: string, context: AudienceActionContext): Promise<void> {
    const counts = await this.groups.findCountsForWard(wardId, id);
    if (!counts) {
      throw new NotFoundException('Audience group not found.');
    }

    const check = checkAudienceSafeToDelete(counts);
    if (!check.safe) {
      throw new BadRequestException(check.reason);
    }

    await this.groups.delete(id);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.group.deleted',
      entityType: 'AudienceGroup',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  // --- Membership --------------------------------------------------------------

  async addMember(
    wardId: string,
    audienceGroupId: string,
    input: AddAudienceMemberRequest,
    context: AudienceActionContext,
  ): Promise<AudienceGroupDetailDto> {
    await this.assertGroupInWard(wardId, audienceGroupId);
    const person = await this.people.findByIdForWard(wardId, input.personId);
    if (!person) {
      throw new NotFoundException('Person not found.');
    }

    const existingMemberIds = await this.members.listPersonIds(audienceGroupId);
    if (isDuplicateMembership(existingMemberIds, input.personId)) {
      throw new ConflictException('This person is already a member of this audience.');
    }

    await this.members.add(audienceGroupId, input.personId, context.actorUserId);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.member.added',
      entityType: 'AudienceGroupMember',
      entityId: audienceGroupId,
      metadata: { personId: input.personId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, audienceGroupId);
  }

  async removeMember(
    wardId: string,
    audienceGroupId: string,
    personId: string,
    context: AudienceActionContext,
  ): Promise<AudienceGroupDetailDto> {
    await this.assertGroupInWard(wardId, audienceGroupId);
    await this.members.remove(audienceGroupId, personId);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.member.removed',
      entityType: 'AudienceGroupMember',
      entityId: audienceGroupId,
      metadata: { personId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, audienceGroupId);
  }

  // --- Destinations --------------------------------------------------------------

  async listDestinations(wardId: string, includeArchived = false): Promise<CommunicationDestinationDto[]> {
    const results = await this.destinations.listForWard(wardId, includeArchived);
    return results.map((destination) => ({
      id: destination.id,
      name: destination.name,
      channel: destination.channel,
      providerAccountReference: destination.providerAccountReference,
      isActive: destination.archivedAt === null,
      createdAt: destination.createdAt.toISOString(),
    }));
  }

  async createDestination(
    wardId: string,
    input: CreateCommunicationDestinationRequest,
    context: AudienceActionContext,
  ): Promise<CommunicationDestinationDto> {
    const destination = await this.destinations.create({
      wardId,
      name: input.name,
      channel: input.channel as CommunicationChannel,
      providerAccountReference: input.providerAccountReference,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'destination.created',
      entityType: 'CommunicationDestination',
      entityId: destination.id,
      metadata: { channel: input.channel },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return {
      id: destination.id,
      name: destination.name,
      channel: destination.channel,
      providerAccountReference: destination.providerAccountReference,
      isActive: true,
      createdAt: destination.createdAt.toISOString(),
    };
  }

  async archiveDestination(wardId: string, id: string, context: AudienceActionContext): Promise<void> {
    const destination = await this.destinations.findByIdForWard(wardId, id);
    if (!destination) {
      throw new NotFoundException('Destination not found.');
    }
    await this.destinations.archive(id);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'destination.archived',
      entityType: 'CommunicationDestination',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  async addDestination(
    wardId: string,
    audienceGroupId: string,
    input: AddAudienceDestinationRequest,
    context: AudienceActionContext,
  ): Promise<AudienceGroupDetailDto> {
    await this.assertGroupInWard(wardId, audienceGroupId);
    const destination = await this.destinations.findByIdForWard(wardId, input.destinationId);
    if (!destination) {
      throw new NotFoundException('Destination not found.');
    }

    try {
      await this.audienceDestinations.add(audienceGroupId, input.destinationId);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('This destination is already linked to this audience.');
      }
      throw error;
    }

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.destination.added',
      entityType: 'AudienceGroup',
      entityId: audienceGroupId,
      metadata: { destinationId: input.destinationId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, audienceGroupId);
  }

  async removeDestination(
    wardId: string,
    audienceGroupId: string,
    destinationId: string,
    context: AudienceActionContext,
  ): Promise<AudienceGroupDetailDto> {
    await this.assertGroupInWard(wardId, audienceGroupId);
    await this.audienceDestinations.remove(audienceGroupId, destinationId);

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'audience.destination.removed',
      entityType: 'AudienceGroup',
      entityId: audienceGroupId,
      metadata: { destinationId },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.get(wardId, audienceGroupId);
  }

  // --- Preview -------------------------------------------------------------------

  /**
   * Previews the deduplicated membership of one or more audiences
   * combined, so a caller assembling a campaign's recipients (Phase 7/8)
   * can see up front who overlaps between the selected audiences rather
   * than discovering duplicate sends later (AGENTS.md #7).
   */
  async preview(wardId: string, audienceGroupIds: string[]): Promise<AudiencePreviewResponse> {
    const sets = await Promise.all(
      audienceGroupIds.map(async (audienceGroupId) => {
        await this.assertGroupInWard(wardId, audienceGroupId);
        const personIds = await this.members.listPersonIds(audienceGroupId);
        return { audienceGroupId, personIds };
      }),
    );

    const merged = mergeAudienceMemberships(sets);
    const allPersonIds = [...new Set(merged.map((person) => person.personId))];
    const peopleById = new Map(
      await Promise.all(
        allPersonIds.map(async (personId) => {
          const person = await this.people.findByIdForWard(wardId, personId);
          return [personId, person] as const;
        }),
      ),
    );

    const members = merged.map((entry) => {
      const person = peopleById.get(entry.personId);
      return {
        personId: entry.personId,
        displayName: person ? (person.preferredName ?? `${person.firstName} ${person.lastName}`) : 'Unknown',
        isMinor: person ? isMinor(person.dateOfBirth) : false,
        audienceGroupIds: entry.audienceGroupIds,
      };
    });

    return {
      totalCount: members.length,
      overlapCount: members.filter((member) => member.audienceGroupIds.length > 1).length,
      members,
    };
  }

  // --- Internal helpers -------------------------------------------------------------

  private async assertGroupInWard(wardId: string, id: string): Promise<AudienceGroupWithDetails> {
    const group = await this.groups.findByIdForWard(wardId, id);
    if (!group) {
      throw new NotFoundException('Audience group not found.');
    }
    return group;
  }

  private toSummary(group: AudienceGroupWithCounts): AudienceGroupSummaryDto {
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      isActive: group.archivedAt === null,
      memberCount: group._count.members,
      destinationCount: group._count.destinations,
    };
  }

  private toDetail(group: AudienceGroupWithDetails): AudienceGroupDetailDto {
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      isActive: group.archivedAt === null,
      members: group.members.map((membership) => ({
        personId: membership.person.id,
        displayName: membership.person.preferredName ?? `${membership.person.firstName} ${membership.person.lastName}`,
        isMinor: isMinor(membership.person.dateOfBirth),
        isActive: membership.person.archivedAt === null,
      })),
      destinations: group.destinations.map((link) => ({
        destinationId: link.destination.id,
        name: link.destination.name,
        channel: link.destination.channel as CommunicationChannel,
      })),
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
    };
  }
}
