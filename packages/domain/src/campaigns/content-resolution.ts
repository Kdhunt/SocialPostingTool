// Pure content-resolution rules for previewing a campaign version.
//
// A campaign has one base message and one base image, with two
// independent override axes (phases/07-campaigns.md): an audience-specific
// override (text and/or image) and a channel-specific override (text
// only). This module resolves what should actually be shown/sent for a
// given (audience, channel) combination, and enforces per-channel length
// limits (e.g. SMS).

export const SMS_MAX_LENGTH = 160;

export interface ContentResolutionInput {
  baseMessage: string | null;
  channelText: string | null;
  audienceOverrideText: string | null;
}

/**
 * Resolves the effective text for one (audience, channel) pairing.
 * Channel-specific text takes precedence (it exists to satisfy a hard
 * platform constraint like SMS length), then the audience-specific
 * override, then the campaign's base message.
 */
export function resolveEffectiveText(input: ContentResolutionInput): string | null {
  return input.channelText ?? input.audienceOverrideText ?? input.baseMessage ?? null;
}

export interface ImageResolutionInput {
  baseImageAssetId: string | null;
  audienceOverrideImageAssetId: string | null;
}

/** Resolves the effective image asset id for a given audience. Images have no per-channel override. */
export function resolveEffectiveImageAssetId(input: ImageResolutionInput): string | null {
  return input.audienceOverrideImageAssetId ?? input.baseImageAssetId ?? null;
}

export interface ChannelLengthCheck {
  valid: boolean;
  maxLength: number | null;
  length: number;
}

/** Validates channel-specific length constraints (currently only SMS has one). */
export function checkChannelTextLength(channel: 'Email' | 'Sms' | 'FacebookPage', text: string): ChannelLengthCheck {
  const maxLength = channel === 'Sms' ? SMS_MAX_LENGTH : null;
  const length = text.length;
  return { valid: maxLength === null || length <= maxLength, maxLength, length };
}
