import { Injectable } from '@nestjs/common';

interface Window {
  count: number;
  windowStartedAt: number;
}

/**
 * Best-effort in-process limiter for anonymous bulletin reads. The public
 * page is meant to be loaded by people, not scraped in a tight loop.
 */
@Injectable()
export class PublicReadRateLimiterService {
  private readonly windows = new Map<string, Window>();
  private readonly maxAttempts = 120;
  /**
   * Bulletin pages are opened from printed QR codes, often by a whole
   * congregation on one chapel network or carrier address, so they get a far
   * larger per-address budget. Responses are also CDN-cached for a minute.
   */
  private readonly maxBulletinReads = 2_000;
  private readonly windowMs = 15 * 60_000;

  consume(key: string, now: Date = new Date()): boolean {
    return this.take(key, this.maxAttempts, now);
  }

  consumeBulletinRead(key: string, now: Date = new Date()): boolean {
    return this.take(key, this.maxBulletinReads, now);
  }

  private take(key: string, max: number, now: Date): boolean {
    const existing = this.windows.get(key);

    if (!existing || now.getTime() - existing.windowStartedAt > this.windowMs) {
      this.windows.set(key, { count: 1, windowStartedAt: now.getTime() });
      return true;
    }

    if (existing.count >= max) {
      return false;
    }

    existing.count += 1;
    return true;
  }
}
