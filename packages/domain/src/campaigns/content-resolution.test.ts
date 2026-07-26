import { describe, expect, it } from 'vitest';
import { checkChannelTextLength, resolveEffectiveImageAssetId, resolveEffectiveText } from './content-resolution.js';

describe('resolveEffectiveText', () => {
  it('falls back to the base message when no overrides exist', () => {
    expect(resolveEffectiveText({ baseMessage: 'Base', channelText: null, audienceOverrideText: null })).toBe('Base');
  });

  it('prefers an audience override over the base message', () => {
    expect(
      resolveEffectiveText({ baseMessage: 'Base', channelText: null, audienceOverrideText: 'Audience override' }),
    ).toBe('Audience override');
  });

  it('prefers channel-specific text over an audience override and the base message', () => {
    expect(
      resolveEffectiveText({ baseMessage: 'Base', channelText: 'Channel text', audienceOverrideText: 'Audience override' }),
    ).toBe('Channel text');
  });

  it('returns null when nothing is set', () => {
    expect(resolveEffectiveText({ baseMessage: null, channelText: null, audienceOverrideText: null })).toBeNull();
  });
});

describe('resolveEffectiveImageAssetId', () => {
  it('falls back to the base image when there is no audience override', () => {
    expect(resolveEffectiveImageAssetId({ baseImageAssetId: 'base-asset', audienceOverrideImageAssetId: null })).toBe(
      'base-asset',
    );
  });

  it('prefers an audience-specific image override', () => {
    expect(
      resolveEffectiveImageAssetId({ baseImageAssetId: 'base-asset', audienceOverrideImageAssetId: 'override-asset' }),
    ).toBe('override-asset');
  });
});

describe('checkChannelTextLength', () => {
  it('enforces the SMS length limit', () => {
    const tooLong = 'x'.repeat(161);
    const result = checkChannelTextLength('Sms', tooLong);
    expect(result.valid).toBe(false);
    expect(result.maxLength).toBe(160);
  });

  it('accepts SMS text within the limit', () => {
    expect(checkChannelTextLength('Sms', 'short text').valid).toBe(true);
  });

  it('has no length limit for Email or FacebookPage', () => {
    const longText = 'x'.repeat(5000);
    expect(checkChannelTextLength('Email', longText).valid).toBe(true);
    expect(checkChannelTextLength('FacebookPage', longText).valid).toBe(true);
  });
});
