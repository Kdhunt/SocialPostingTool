import { Inject, Injectable } from '@nestjs/common';
import { createHmac, randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';
import { APP_CONFIG } from '../config/app-config.module.js';
import type { AppConfig } from '@ward-comms/config';

/**
 * Ward code hashing adapter. Hashed SEPARATELY from user passwords (its
 * own Argon2id call, its own column, its own table) and combined with a
 * server-side pepper (WARD_CODE_PEPPER) before hashing, so a database
 * leak alone is never enough to recover a valid ward code even if it is
 * short/shared (see AGENTS.md #1 and security.mdc).
 */
@Injectable()
export class WardCodeHasherService {
  private dummyHash: Promise<string> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /**
   * Spends one full Argon2 verify against a throwaway hash and always
   * returns false, so a sign-in whose code matched no unit costs the same
   * as one whose code did. Without this, response time would reveal which
   * codes belong to real units.
   */
  async verifyAgainstDummy(wardCode: string): Promise<false> {
    this.dummyHash ??= hash(randomBytes(32).toString('hex'));
    await this.verify(await this.dummyHash, wardCode);
    return false;
  }

  private withPepper(wardCode: string): string {
    return `${wardCode}:${this.config.wardCodePepper}`;
  }

  async hash(wardCode: string): Promise<string> {
    return hash(this.withPepper(wardCode));
  }

  /**
   * Deterministic, pepper-keyed value for finding a unit by its code with one
   * indexed query. A database leak alone still cannot be brute-forced; the
   * Argon2 hash remains what is verified.
   */
  lookupKey(wardCode: string): string {
    return createHmac('sha256', this.config.wardCodePepper).update(wardCode).digest('hex');
  }

  async verify(codeHash: string, wardCode: string): Promise<boolean> {
    try {
      return await verify(codeHash, this.withPepper(wardCode));
    } catch {
      return false;
    }
  }
}
