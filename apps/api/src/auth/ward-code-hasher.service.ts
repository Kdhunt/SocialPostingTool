import { Inject, Injectable } from '@nestjs/common';
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
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  private withPepper(wardCode: string): string {
    return `${wardCode}:${this.config.wardCodePepper}`;
  }

  async hash(wardCode: string): Promise<string> {
    return hash(this.withPepper(wardCode));
  }

  async verify(codeHash: string, wardCode: string): Promise<boolean> {
    try {
      return await verify(codeHash, this.withPepper(wardCode));
    } catch {
      return false;
    }
  }
}
