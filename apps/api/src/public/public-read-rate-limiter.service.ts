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
  private readonly windowMs = 15 * 60_000;

  consume(key: string, now: Date = new Date()): boolean {
    const existing = this.windows.get(key);

    if (!existing || now.getTime() - existing.windowStartedAt > this.windowMs) {
      this.windows.set(key, { count: 1, windowStartedAt: now.getTime() });
      return true;
    }

    if (existing.count >= this.maxAttempts) {
      return false;
    }

    existing.count += 1;
    return true;
  }
}
