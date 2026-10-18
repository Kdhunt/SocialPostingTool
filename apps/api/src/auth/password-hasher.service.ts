import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id password hashing adapter. This is the only place in the
 * codebase allowed to import the argon2 binding — everything else depends
 * on this service's interface (see .cursor/rules/security.mdc: "Hash
 * passwords using Argon2id").
 */
@Injectable()
export class PasswordHasherService {
  private dummyHash: Promise<string> | null = null;

  async hash(password: string): Promise<string> {
    return hash(password);
  }

  /**
   * Runs a full Argon2 verify against a throwaway hash and always returns
   * false, so a sign-in that matched no user takes as long as a wrong password.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    this.dummyHash ??= hash(randomBytes(32).toString('hex'));
    await this.verify(await this.dummyHash, password);
    return false;
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
