import { describe, expect, it } from 'vitest';
import {
  comparePublicBulletinNewestFirst,
  isPublicBulletinCampaign,
  publicBulletinImageUrl,
  publicBulletinMessage,
  publicBulletinPublishedAt,
} from './public-bulletin.js';

describe('isPublicBulletinCampaign', () => {
  it('includes sent, non-archived campaigns', () => {
    expect(isPublicBulletinCampaign({ status: 'Sent', archivedAt: null })).toBe(true);
  });

  it('excludes drafts, cancelled, and archived sent campaigns', () => {
    expect(isPublicBulletinCampaign({ status: 'Draft', archivedAt: null })).toBe(false);
    expect(isPublicBulletinCampaign({ status: 'Cancelled', archivedAt: null })).toBe(false);
    expect(isPublicBulletinCampaign({ status: 'Sent', archivedAt: new Date('2026-01-01T00:00:00.000Z') })).toBe(
      false,
    );
  });
});

describe('publicBulletinPublishedAt', () => {
  it('prefers completedAt when present', () => {
    const createdAt = new Date('2026-01-01T12:00:00.000Z');
    const completedAt = new Date('2026-01-01T12:05:00.000Z');
    expect(publicBulletinPublishedAt({ createdAt, completedAt }).toISOString()).toBe(completedAt.toISOString());
  });

  it('falls back to createdAt', () => {
    const createdAt = new Date('2026-01-01T12:00:00.000Z');
    expect(publicBulletinPublishedAt({ createdAt, completedAt: null })).toEqual(createdAt);
  });
});

describe('comparePublicBulletinNewestFirst', () => {
  it('orders later publish dates first', () => {
    const older = new Date('2026-01-01T00:00:00.000Z');
    const newer = new Date('2026-02-01T00:00:00.000Z');
    expect([older, newer].sort(comparePublicBulletinNewestFirst)).toEqual([newer, older]);
  });
});

describe('publicBulletinMessage', () => {
  it('uses the base message when present', () => {
    expect(
      publicBulletinMessage({
        baseMessage: '  Fictional sacrament reminder  ',
        channelTexts: [{ channel: 'Email', text: 'Email only' }],
      }),
    ).toBe('Fictional sacrament reminder');
  });

  it('falls back to Email then Facebook then SMS text', () => {
    expect(
      publicBulletinMessage({
        baseMessage: null,
        channelTexts: [{ channel: 'FacebookPage', text: 'Fictional page post' }],
      }),
    ).toBe('Fictional page post');
  });
});

describe('publicBulletinImageUrl', () => {
  it('allows http(s) storage references only', () => {
    expect(publicBulletinImageUrl('https://cdn.example.test/poster.png')).toBe(
      'https://cdn.example.test/poster.png',
    );
    expect(publicBulletinImageUrl('asset-uuid')).toBeNull();
    expect(publicBulletinImageUrl(null)).toBeNull();
  });
});
