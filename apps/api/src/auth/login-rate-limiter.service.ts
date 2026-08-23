import { Injectable } from '@nestjs/common';

interface Window {
  count: number;
  windowStartedAt: number;
}

/**
 * Best-effort, in-process sliding-window rate limiter for the login and
 * ward-code endpoints, keyed by `ip:username`. This is intentionally
 * simple and NOT shared across multiple API instances — the durable,
 * cross-instance defense against brute force is the persisted
 * `ApplicationUser.failedLoginAttempts` / `lockedUntil` lockout policy in
 * packages/domain (see lockout-policy.ts). In a multi-instance production
 * deployment, replace this with a Redis-backed limiter (Redis is already
 * part of this stack for BullMQ — see phases/08-delivery-engine.md) so the
 * limit is enforced consistently across instances.
 */
@Injectable()
export class LoginRateLimiterService {
  private readonly windows = new Map<string, Window>();
  private readonly maxAttempts = 10;
  private readonly windowMs = 15 * 60_000;

  /** Returns true if this key is currently within its allowed attempt budget. */
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

  reset(key: string): void {
    this.windows.delete(key);
  }
}
