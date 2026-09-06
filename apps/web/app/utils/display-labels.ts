import type {
  CampaignStatusDto,
  CommunicationChannel,
  DeliveryBatchStatusDto,
  DeliveryRecipientStatusDto,
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

const DELIVERY_BATCH_STATUS_LABELS: Record<DeliveryBatchStatusDto, string> = {
  Pending: 'Pending',
  Running: 'Sending',
  Completed: 'Completed',
  PartialFailure: 'Partial failure',
  Failed: 'Failed',
};

const DELIVERY_RECIPIENT_STATUS_LABELS: Record<DeliveryRecipientStatusDto, string> = {
  Pending: 'Pending',
  Queued: 'Queued',
  Sending: 'Sending',
  Sent: 'Sent',
  Retrying: 'Retrying',
  DeadLettered: 'Dead lettered',
  Skipped: 'Skipped',
};

const SKIP_REASON_LABELS: Record<string, string> = {
  no_contact_method: 'No matching contact method',
  no_consent: 'Consent not granted',
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

export function deliveryBatchStatusLabel(status: DeliveryBatchStatusDto): string {
  return DELIVERY_BATCH_STATUS_LABELS[status];
}

export function deliveryRecipientStatusLabel(status: DeliveryRecipientStatusDto): string {
  return DELIVERY_RECIPIENT_STATUS_LABELS[status];
}

export function skipReasonLabel(reason: string): string {
  return SKIP_REASON_LABELS[reason] ?? reason.replaceAll('_', ' ');
}
