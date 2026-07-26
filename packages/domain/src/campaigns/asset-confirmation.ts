// Campaign asset confirmation gate — AGENTS.md #13.
//
// AI-generated images start Pending; only Confirmed assets may be attached
// to campaign content or used in delivery.

export const CAMPAIGN_ASSET_CONFIRMATION_STATUSES = ['Pending', 'Confirmed', 'Rejected'] as const;
export type CampaignAssetConfirmationStatus = (typeof CAMPAIGN_ASSET_CONFIRMATION_STATUSES)[number];

/** Whether an asset may be set as base or audience override image on a version. */
export function isAssetUsableInCampaign(status: CampaignAssetConfirmationStatus): boolean {
  return status === 'Confirmed';
}

/** Whether a Pending asset may transition to Confirmed (explicit user action). */
export function canConfirmAsset(status: CampaignAssetConfirmationStatus): boolean {
  return status === 'Pending';
}

/** Whether a Pending asset may be discarded. */
export function canRejectAsset(status: CampaignAssetConfirmationStatus): boolean {
  return status === 'Pending';
}
