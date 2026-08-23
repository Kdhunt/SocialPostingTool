import { describe, expect, it } from 'vitest';
import { canConfirmAsset, canRejectAsset, isAssetUsableInCampaign } from './asset-confirmation.js';

describe('asset confirmation gate', () => {
  it('only Confirmed assets are usable in campaign content', () => {
    expect(isAssetUsableInCampaign('Confirmed')).toBe(true);
    expect(isAssetUsableInCampaign('Pending')).toBe(false);
    expect(isAssetUsableInCampaign('Rejected')).toBe(false);
  });

  it('only Pending assets can be confirmed or rejected', () => {
    expect(canConfirmAsset('Pending')).toBe(true);
    expect(canConfirmAsset('Confirmed')).toBe(false);
    expect(canRejectAsset('Pending')).toBe(true);
    expect(canRejectAsset('Rejected')).toBe(false);
  });
});
