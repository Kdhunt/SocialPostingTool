import { describe, expect, it } from 'vitest';
import {
  addCampaignAudienceRequestSchema,
  campaignPreviewResponseSchema,
  campaignStatusSchema,
  createCampaignRequestSchema,
  scheduleCampaignRequestSchema,
  setCampaignChannelTextRequestSchema,
} from './campaign.schema.js';

describe('campaignStatusSchema', () => {
  it('accepts every defined lifecycle status', () => {
    for (const status of ['Draft', 'PendingApproval', 'Approved', 'Rejected', 'Scheduled', 'Sending', 'Sent', 'Cancelled']) {
      expect(() => campaignStatusSchema.parse(status)).not.toThrow();
    }
  });

  it('rejects an unknown status', () => {
    expect(() => campaignStatusSchema.parse('Sending Later')).toThrow();
  });
});

describe('createCampaignRequestSchema', () => {
  it('requires a name but allows an omitted base message', () => {
    const result = createCampaignRequestSchema.parse({ name: 'Fictional Campaign' });
    expect(result.baseMessage).toBeUndefined();
  });

  it('rejects an empty name', () => {
    expect(() => createCampaignRequestSchema.parse({ name: '' })).toThrow();
  });
});

describe('addCampaignAudienceRequestSchema', () => {
  it('accepts an audience id with no overrides', () => {
    const result = addCampaignAudienceRequestSchema.parse({ audienceGroupId: 'a1' });
    expect(result.overrideText).toBeUndefined();
  });
});

describe('setCampaignChannelTextRequestSchema', () => {
  it('requires non-empty channel text', () => {
    expect(() => setCampaignChannelTextRequestSchema.parse({ channel: 'Sms', text: '' })).toThrow();
  });
});

describe('campaignPreviewResponseSchema', () => {
  it('requires named recipients on each audience so the review UI can list people', () => {
    const parsed = campaignPreviewResponseSchema.parse({
      versionNumber: 1,
      totalUniqueRecipients: 1,
      overlapCount: 0,
      audiences: [
        {
          audienceGroupId: 'aud-1',
          audienceGroupName: 'Fictional Email Audience',
          recipientCount: 1,
          resolvedImageAssetId: null,
          recipients: [{ personId: 'person-1', displayName: 'Fictional Alex' }],
          channels: [{ channel: 'Email', text: 'Hello', length: 5, exceedsLimit: false }],
        },
      ],
    });
    expect(parsed.audiences[0]?.recipients[0]?.displayName).toBe('Fictional Alex');
  });

  it('rejects an audience preview that omits recipients', () => {
    expect(() =>
      campaignPreviewResponseSchema.parse({
        versionNumber: 1,
        totalUniqueRecipients: 0,
        overlapCount: 0,
        audiences: [
          {
            audienceGroupId: 'aud-1',
            audienceGroupName: 'Empty',
            recipientCount: 0,
            resolvedImageAssetId: null,
            channels: [],
          },
        ],
      }),
    ).toThrow();
  });
});

describe('scheduleCampaignRequestSchema', () => {
  it('requires a valid ISO datetime', () => {
    expect(() => scheduleCampaignRequestSchema.parse({ scheduledFor: 'not-a-date' })).toThrow();
    expect(() => scheduleCampaignRequestSchema.parse({ scheduledFor: '2026-08-01T12:00:00.000Z' })).not.toThrow();
  });
});
