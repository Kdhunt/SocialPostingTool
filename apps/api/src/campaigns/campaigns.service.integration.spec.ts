// Live-database integration tests for the Phase 7 campaign drafting flow.
//
// Skips automatically (rather than failing) when no migrated PostgreSQL
// instance is reachable — see apps/api/src/auth/auth.service.integration.spec.ts
// for the same pattern and the commands to bring one up locally.
import { randomUUID } from 'node:crypto';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AudienceGroupRepository } from '../audiences/repositories/audience-group.repository.js';
import { AudienceMemberRepository } from '../audiences/repositories/audience-member.repository.js';
import { ContactMethodRepository } from '../directory/repositories/contact-method.repository.js';
import { DeliveryService } from '../delivery/delivery.service.js';
import { DeliveryBatchRepository } from '../delivery/repositories/delivery-batch.repository.js';
import { DeliveryRecipientRepository } from '../delivery/repositories/delivery-recipient.repository.js';
import { CampaignApprovalRepository } from './repositories/campaign-approval.repository.js';
import { CampaignAssetRepository } from './repositories/campaign-asset.repository.js';
import { CampaignAudienceRepository } from './repositories/campaign-audience.repository.js';
import { CampaignChannelVersionRepository } from './repositories/campaign-channel-version.repository.js';
import { CampaignDestinationRepository } from './repositories/campaign-destination.repository.js';
import { CampaignRepository } from './repositories/campaign.repository.js';
import { CampaignScheduleRepository } from './repositories/campaign-schedule.repository.js';
import { CampaignVersionRepository } from './repositories/campaign-version.repository.js';
import { CampaignsService, type CampaignActionContext } from './campaigns.service.js';

/** No-op queue so integration tests do not require Redis. */
class StubDeliveryQueueService {
  async enqueue(_deliveryRecipientId: string): Promise<void> {
    return;
  }
}

async function isMigratedDatabaseAvailable(prisma: PrismaService): Promise<boolean> {
  try {
    await prisma.client.ward.findFirst();
    return true;
  } catch {
    return false;
  }
}

const prisma = new PrismaService();
const databaseAvailable = await isMigratedDatabaseAvailable(prisma);

describe.skipIf(!databaseAvailable)('CampaignsService — live PostgreSQL integration', () => {
  const audit = new AuditService(prisma);
  const audienceGroups = new AudienceGroupRepository(prisma);
  const audienceMembers = new AudienceMemberRepository(prisma);
  const contactMethods = new ContactMethodRepository(prisma);
  const campaigns = new CampaignRepository(prisma);
  const versions = new CampaignVersionRepository(prisma);
  const assets = new CampaignAssetRepository(prisma);
  const campaignAudiences = new CampaignAudienceRepository(prisma);
  const channelVersions = new CampaignChannelVersionRepository(prisma);
  const campaignDestinations = new CampaignDestinationRepository(prisma);
  const approvals = new CampaignApprovalRepository(prisma);
  const schedules = new CampaignScheduleRepository(prisma);
  const batches = new DeliveryBatchRepository(prisma);
  const recipients = new DeliveryRecipientRepository(prisma);
  const queue = new StubDeliveryQueueService() as never;
  const delivery = new DeliveryService(
    campaigns,
    versions,
    audienceMembers,
    contactMethods,
    batches,
    recipients,
    queue,
    audit,
  );

  const service = new CampaignsService(
    campaigns,
    versions,
    assets,
    campaignAudiences,
    channelVersions,
    campaignDestinations,
    approvals,
    schedules,
    audienceGroups,
    audienceMembers,
    delivery,
    audit,
  );

  let wardId: string;
  let actorUserId: string;

  function ctx(): CampaignActionContext {
    return { actorUserId, ipAddress: '203.0.113.40', userAgent: 'vitest' };
  }

  beforeAll(async () => {
    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  async function setupWard(): Promise<void> {
    const ward = await prisma.client.ward.create({ data: { name: `Fictional Campaign Ward ${randomUUID()}` } });
    wardId = ward.id;
    const user = await prisma.client.applicationUser.create({
      data: {
        wardId,
        username: `fictional.campaign.actor.${randomUUID()}`,
        displayName: 'Fictional Campaign Actor',
        passwordHash: 'not-a-real-hash',
      },
    });
    actorUserId = user.id;
  }

  async function createFictionalPerson(firstName: string): Promise<string> {
    const person = await prisma.client.person.create({
      data: { wardId, firstName, lastName: 'Fictional', dateOfBirth: new Date('1980-01-01') },
    });
    return person.id;
  }

  async function createAudienceWithMembersAndDestination(
    name: string,
    personIds: string[],
    channel: 'Email' | 'Sms' | 'FacebookPage' = 'Email',
  ): Promise<{ audienceGroupId: string; destinationId: string }> {
    const group = await prisma.client.audienceGroup.create({ data: { wardId, name } });
    for (const personId of personIds) {
      await prisma.client.audienceGroupMember.create({ data: { audienceGroupId: group.id, personId } });
    }
    const destination = await prisma.client.communicationDestination.create({
      data: { wardId, name: `${name} destination`, channel },
    });
    await prisma.client.audienceDestination.create({
      data: { audienceGroupId: group.id, destinationId: destination.id },
    });
    return { audienceGroupId: group.id, destinationId: destination.id };
  }

  afterEach(async () => {
    if (!wardId) return;
    await prisma.client.auditEvent.deleteMany({ where: { wardId } });
    await prisma.client.deliveryAttempt.deleteMany({
      where: { deliveryRecipient: { deliveryBatch: { wardId } } },
    });
    await prisma.client.deliveryRecipient.deleteMany({ where: { deliveryBatch: { wardId } } });
    await prisma.client.deliveryBatch.deleteMany({ where: { wardId } });
    await prisma.client.campaignSchedule.deleteMany({ where: { campaign: { wardId } } });
    await prisma.client.campaignApproval.deleteMany({ where: { campaign: { wardId } } });
    await prisma.client.campaignDestination.deleteMany({ where: { campaignVersion: { campaign: { wardId } } } });
    await prisma.client.campaignAudience.deleteMany({ where: { campaignVersion: { campaign: { wardId } } } });
    await prisma.client.campaignChannelVersion.deleteMany({ where: { campaignVersion: { campaign: { wardId } } } });
    await prisma.client.campaignAsset.deleteMany({ where: { campaign: { wardId } } });
    await prisma.client.campaignVersion.deleteMany({ where: { campaign: { wardId } } });
    await prisma.client.campaign.deleteMany({ where: { wardId } });
    await prisma.client.audienceDestination.deleteMany({ where: { audienceGroup: { wardId } } });
    await prisma.client.audienceGroupMember.deleteMany({ where: { audienceGroup: { wardId } } });
    await prisma.client.audienceGroup.deleteMany({ where: { wardId } });
    await prisma.client.communicationDestination.deleteMany({ where: { wardId } });
    await prisma.client.person.deleteMany({ where: { wardId } });
    await prisma.client.applicationUser.deleteMany({ where: { wardId } });
    await prisma.client.ward.deleteMany({ where: { id: wardId } });
    wardId = '';
  });

  it('drafts a campaign, adds an audience, and recomputes destinations from that audience', async () => {
    await setupWard();
    const { audienceGroupId, destinationId } = await createAudienceWithMembersAndDestination('Draft Audience', []);
    const created = await service.create(wardId, { name: 'Fictional Draft Campaign', baseMessage: 'Hello ward!' }, ctx());
    expect(created.status).toBe('Draft');

    const withAudience = await service.addAudience(wardId, created.id, { audienceGroupId }, ctx());
    expect(withAudience.currentVersion.audiences).toHaveLength(1);
    expect(withAudience.currentVersion.destinations.map((d) => d.destinationId)).toEqual([destinationId]);
  });

  it('rejects submission for approval when the campaign has no content and no audiences', async () => {
    await setupWard();
    const created = await service.create(wardId, { name: 'Empty Campaign' }, ctx());
    const validation = await service.validateForSubmission(wardId, created.id);
    expect(validation.valid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);

    await expect(service.submitForApproval(wardId, created.id, ctx())).rejects.toThrow();
  });

  it('rejects submission when the only selected audience has no linked, active destination', async () => {
    await setupWard();
    const group = await prisma.client.audienceGroup.create({ data: { wardId, name: 'Destination-less Audience' } });
    const created = await service.create(wardId, { name: 'No Destination Campaign', baseMessage: 'Body text' }, ctx());
    await service.addAudience(wardId, created.id, { audienceGroupId: group.id }, ctx());

    const validation = await service.validateForSubmission(wardId, created.id);
    expect(validation.valid).toBe(false);
    await expect(service.submitForApproval(wardId, created.id, ctx())).rejects.toThrow();
  });

  it('rejects submission when a linked destination has since been archived', async () => {
    await setupWard();
    const { audienceGroupId, destinationId } = await createAudienceWithMembersAndDestination('Archived Destination Audience', []);
    const created = await service.create(wardId, { name: 'Archived Destination Campaign', baseMessage: 'Body text' }, ctx());
    await service.addAudience(wardId, created.id, { audienceGroupId }, ctx());

    await prisma.client.communicationDestination.update({ where: { id: destinationId }, data: { archivedAt: new Date() } });

    const validation = await service.validateForSubmission(wardId, created.id);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toMatch(/archived/i);
    await expect(service.submitForApproval(wardId, created.id, ctx())).rejects.toThrow();
  });

  it('previews deduplicated recipients across overlapping audiences without double-counting a shared member', async () => {
    await setupWard();
    const sharedPersonId = await createFictionalPerson('Shared');
    const onlyInAPersonId = await createFictionalPerson('OnlyInA');
    const { audienceGroupId: audienceAId } = await createAudienceWithMembersAndDestination('Overlap A', [sharedPersonId, onlyInAPersonId]);
    const { audienceGroupId: audienceBId } = await createAudienceWithMembersAndDestination('Overlap B', [sharedPersonId]);

    const created = await service.create(wardId, { name: 'Overlap Campaign', baseMessage: 'Body text' }, ctx());
    await service.addAudience(wardId, created.id, { audienceGroupId: audienceAId }, ctx());
    await service.addAudience(wardId, created.id, { audienceGroupId: audienceBId }, ctx());

    const preview = await service.preview(wardId, created.id);
    expect(preview.totalUniqueRecipients).toBe(2);
    expect(preview.overlapCount).toBe(1);
  });

  it('keeps a revised version independent from the version an approval decision was recorded against', async () => {
    await setupWard();
    const { audienceGroupId } = await createAudienceWithMembersAndDestination('Version Independence Audience', []);
    const created = await service.create(wardId, { name: 'Revision Campaign', baseMessage: 'Original body' }, ctx());
    await service.addAudience(wardId, created.id, { audienceGroupId }, ctx());

    await service.submitForApproval(wardId, created.id, ctx());
    const rejected = await service.decideApproval(wardId, created.id, 'Rejected', 'Needs a rewrite', ctx());
    expect(rejected.status).toBe('Rejected');
    const rejectedVersionNumber = rejected.currentVersion.versionNumber;
    expect(rejected.approvals).toHaveLength(1);
    expect(rejected.approvals[0]?.decision).toBe('Rejected');

    const revised = await service.revise(wardId, created.id, ctx());
    expect(revised.status).toBe('Draft');
    expect(revised.currentVersion.versionNumber).toBe(rejectedVersionNumber + 1);
    // Editing the new draft version must never mutate the prior version's
    // content, since the rejected version's text is what the approval
    // decision above was recorded against.
    await service.updateVersionContent(wardId, created.id, { baseMessage: 'Rewritten body' }, ctx());
    const afterEdit = await service.get(wardId, created.id);
    expect(afterEdit.currentVersion.baseMessage).toBe('Rewritten body');
    expect(afterEdit.approvals[0]?.decision).toBe('Rejected');
    expect(afterEdit.currentVersion.versionNumber).toBe(rejectedVersionNumber + 1);
  });

  it('rejects invalid status transitions, such as approving a campaign that is still a Draft', async () => {
    await setupWard();
    const created = await service.create(wardId, { name: 'Invalid Transition Campaign', baseMessage: 'Body text' }, ctx());
    await expect(service.decideApproval(wardId, created.id, 'Approved', undefined, ctx())).rejects.toThrow();
    await expect(service.sendNow(wardId, created.id, ctx())).rejects.toThrow();
    await expect(service.schedule(wardId, created.id, new Date(Date.now() + 60_000), ctx())).rejects.toThrow();
  });

  it('drafts, submits, approves, and starts delivery for a fully valid campaign end to end', async () => {
    await setupWard();
    const personId = await createFictionalPerson('Recipient');
    const { audienceGroupId } = await createAudienceWithMembersAndDestination('Happy Path Audience', [personId]);
    const created = await service.create(wardId, { name: 'Happy Path Campaign', baseMessage: 'Hello!' }, ctx());
    await service.addAudience(wardId, created.id, { audienceGroupId }, ctx());

    const submitted = await service.submitForApproval(wardId, created.id, ctx());
    expect(submitted.status).toBe('PendingApproval');

    const approved = await service.decideApproval(wardId, created.id, 'Approved', undefined, ctx());
    expect(approved.status).toBe('Approved');

    // No granted consent on the person → expansion skips everyone and the
    // batch completes immediately (no Redis worker required for this case).
    const sent = await service.sendNow(wardId, created.id, ctx());
    expect(sent.status).toBe('Sent');
    const batches = await delivery.listForCampaign(wardId, created.id);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.skippedCount).toBeGreaterThan(0);
  });

  it('never lets an already-sent campaign be edited', async () => {
    await setupWard();
    const { audienceGroupId } = await createAudienceWithMembersAndDestination('Locked Audience', []);
    const created = await service.create(wardId, { name: 'Locked Campaign', baseMessage: 'Body text' }, ctx());
    await service.addAudience(wardId, created.id, { audienceGroupId }, ctx());
    await service.submitForApproval(wardId, created.id, ctx());
    await service.decideApproval(wardId, created.id, 'Approved', undefined, ctx());
    await service.sendNow(wardId, created.id, ctx());

    await expect(service.updateVersionContent(wardId, created.id, { baseMessage: 'Too late' }, ctx())).rejects.toThrow();
  });
});
