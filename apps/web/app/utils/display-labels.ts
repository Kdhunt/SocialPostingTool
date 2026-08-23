import type {
  CampaignStatusDto,
  CommunicationChannel,
  OverlapResolutionStrategyDto,
} from '@ward-comms/validation';

const CAMPAIGN_STATUS_LABELS: Record<CampaignStatusDto, string> = {
  Draft: 'Draft',
  PendingApproval: 'Waiting for approval',
  Approved: 'Approved',
  Rejected: 'Rejected',
  Scheduled: 'Scheduled',
  Sending: 'Sending',
  Sent: 'Sent',
  Cancelled: 'Cancelled',
};

const OVERLAP_STRATEGY_LABELS: Record<OverlapResolutionStrategyDto, string> = {
  FirstAudienceWins: 'First audience in list wins',
  PreferBase: 'Prefer base campaign message',
  PreferSpecificAudience: 'Prefer a specific audience',
};

const CHANNEL_LABELS: Record<CommunicationChannel, string> = {
  Email: 'Email',
  Sms: 'SMS',
  FacebookPage: 'Facebook page',
};

export function campaignStatusLabel(status: CampaignStatusDto): string {
  return CAMPAIGN_STATUS_LABELS[status];
}

export function overlapStrategyLabel(strategy: OverlapResolutionStrategyDto): string {
  return OVERLAP_STRATEGY_LABELS[strategy];
}

export function channelLabel(channel: CommunicationChannel): string {
  return CHANNEL_LABELS[channel];
}

export function approvalDecisionLabel(decision: string): string {
  if (decision === 'Approved') return 'Approved';
  if (decision === 'Rejected') return 'Rejected';
  return decision;
}
