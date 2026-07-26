import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Argon2id password hashing adapter. This is the only place in the
 * codebase allowed to import the argon2 binding — everything else depends
 * on this service's interface (see .cursor/rules/security.mdc: "Hash
 * passwords using Argon2id").
 */
@Injectable()
export class PasswordHasherService {
  async hash(password: string): Promise<string> {
    return hash(password);
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    try {
      return await verify(passwordHash, password);
    } catch {
      return false;
    }
  }
}
