import type { CampaignStatus } from './campaign-status.js';

/**
 * Public bulletin rules for `/{wardSlug}` (e.g. /grangecreek).
 *
 * Only **Sent**, non-archived campaigns are public. Drafts, approvals, and
 * cancelled campaigns stay private. The page shows campaign name, publish
 * time, and the sent version's base (or channel) text — never audiences,
 * people, or contact details.
 */

export function isPublicBulletinCampaign(input: {
  status: CampaignStatus;
  archivedAt: Date | null;
}): boolean {
  return input.status === 'Sent' && input.archivedAt === null;
}

export function publicBulletinPublishedAt(input: { completedAt: Date | null; createdAt: Date }): Date {
  return input.completedAt ?? input.createdAt;
}

export function comparePublicBulletinNewestFirst(a: Date, b: Date): number {
  return b.getTime() - a.getTime();
}

export function publicBulletinImageUrl(storageReference: string | null | undefined): string | null {
  if (!storageReference) {
    return null;
  }
  try {
    const url = new URL(storageReference);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return storageReference;
    }
  } catch {
    return null;
  }
  return null;
}

export function publicBulletinMessage(input: {
  baseMessage: string | null;
  channelTexts: ReadonlyArray<{ channel: string; text: string }>;
}): string | null {
  const trimmedBase = input.baseMessage?.trim() || null;
  if (trimmedBase) {
    return trimmedBase;
  }
  const byChannel = new Map(input.channelTexts.map((row) => [row.channel, row.text.trim()]));
  const channelText =
    (byChannel.get('Email') || null) ??
    (byChannel.get('FacebookPage') || null) ??
    (byChannel.get('Sms') || null);
  return channelText;
}
