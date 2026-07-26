// Schema "compile" test: verifies the generated Prisma Client's data model
// matches the entities required by phases/07-campaigns.md, without needing
// a live database connection. Runs in every environment (including
// sandboxes without Docker) — see schema.integration.test.ts for the
// live-database variant.
import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';

const models = Prisma.dmmf.datamodel.models;

function getModel(name: string): Prisma.DMMF.Model {
  const model = models.find((candidate) => candidate.name === name);
  if (!model) {
    throw new Error(`Expected model "${name}" to exist in the Prisma schema.`);
  }
  return model;
}

function getField(model: Prisma.DMMF.Model, fieldName: string): Prisma.DMMF.Field {
  const field = model.fields.find((candidate) => candidate.name === fieldName);
  if (!field) {
    throw new Error(`Expected field "${fieldName}" to exist on model "${model.name}".`);
  }
  return field;
}

describe('Prisma schema — Phase 7 campaign entities exist', () => {
  it.each([
    'Campaign',
    'CampaignAudience',
    'CampaignVersion',
    'CampaignChannelVersion',
    'CampaignAsset',
    'CampaignDestination',
    'CampaignApproval',
    'CampaignSchedule',
  ])('defines model %s', (modelName) => {
    expect(() => getModel(modelName)).not.toThrow();
  });
});

describe('Prisma schema — campaign versioning scopes overrides per version, not per campaign', () => {
  it('CampaignAudience is scoped to campaignVersionId (audience overrides never leak across versions)', () => {
    const audience = getModel('CampaignAudience');
    expect(audience.fields.some((field) => field.name === 'campaignVersionId')).toBe(true);
    expect(audience.fields.some((field) => field.name === 'overrideText')).toBe(true);
    expect(audience.fields.some((field) => field.name === 'overrideImageAssetId')).toBe(true);
  });

  it('CampaignDestination is scoped to campaignVersionId', () => {
    const destination = getModel('CampaignDestination');
    expect(destination.fields.some((field) => field.name === 'campaignVersionId')).toBe(true);
    expect(destination.fields.some((field) => field.name === 'destinationId')).toBe(true);
  });

  it('CampaignChannelVersion is scoped to campaignVersionId with a channel-specific text field', () => {
    const channelVersion = getModel('CampaignChannelVersion');
    expect(channelVersion.fields.some((field) => field.name === 'campaignVersionId')).toBe(true);
    expect(getField(channelVersion, 'channel').type).toBe('CommunicationChannel');
    expect(channelVersion.fields.some((field) => field.name === 'text')).toBe(true);
  });
});

describe('Prisma schema — campaign assets always require alt text', () => {
  it('CampaignAsset.altText is a required field', () => {
    const asset = getModel('CampaignAsset');
    expect(getField(asset, 'altText').isRequired).toBe(true);
  });
});

describe('Prisma schema — campaign approvals are append-only', () => {
  it('CampaignApproval has no archivedAt (a resubmission creates a new row, not an edit)', () => {
    const approval = getModel('CampaignApproval');
    expect(approval.fields.some((field) => field.name === 'archivedAt')).toBe(false);
    expect(getField(approval, 'decision').type).toBe('CampaignApprovalDecision');
  });
});

describe('Prisma schema — Campaign lifecycle enum', () => {
  it('CampaignStatus supports the full draft-to-terminal lifecycle', () => {
    const enums = Prisma.dmmf.datamodel.enums;
    const found = enums.find((candidate) => candidate.name === 'CampaignStatus');
    if (!found) throw new Error('Expected enum "CampaignStatus" to exist.');
    expect(found.values.map((value) => value.name)).toEqual([
      'Draft',
      'PendingApproval',
      'Approved',
      'Rejected',
      'Scheduled',
      'Sending',
      'Sent',
      'Cancelled',
    ]);
  });

  it('Campaign.status defaults to Draft', () => {
    const campaign = getModel('Campaign');
    const status = getField(campaign, 'status');
    expect(status.hasDefaultValue).toBe(true);
    expect(status.default).toBe('Draft');
  });
});
