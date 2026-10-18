import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { WardCodeVersion } from '@prisma/client';
import { WardCodeRepository } from './repositories/ward-code.repository.js';
import { WardCodeHasherService } from './ward-code-hasher.service.js';

/**
 * Finds which unit (ward, stake, region or district) a sign-in code belongs
 * to. Codes are matched through the indexed lookup key, then confirmed with
 * the Argon2 hash. Rows created before lookup keys existed are still checked
 * and get their key backfilled on first match, so that set shrinks to empty.
 */
@Injectable()
export class UnitCodeLookupService {
  constructor(
    @Inject(WardCodeRepository) private readonly wardCodes: WardCodeRepository,
    @Inject(WardCodeHasherService) private readonly hasher: WardCodeHasherService,
  ) {}

  /** Every active code version that `code` matches. Normally zero or one. */
  async findMatches(code: string): Promise<WardCodeVersion[]> {
    const lookupKey = this.hasher.lookupKey(code);
    const keyed = await this.wardCodes.findActiveByLookupKey(lookupKey);
    const legacy = await this.wardCodes.listActiveVersionsWithoutLookupKey();

    const matches: WardCodeVersion[] = [];
    for (const version of [...keyed, ...legacy]) {
      if (await this.hasher.verify(version.codeHash, code)) {
        matches.push(version);
        if (version.lookupKey === null) {
          await this.wardCodes.setLookupKey(version.id, lookupKey);
        }
      }
    }
    return matches;
  }

  /** The single unit this code signs in to, or null if none or ambiguous. */
  async resolve(code: string): Promise<WardCodeVersion | null> {
    const matches = await this.findMatches(code);
    return matches.length === 1 ? (matches[0] ?? null) : null;
  }

  /**
   * Rejects a code that is already the active code of a different unit, so a
   * code always identifies exactly one unit at sign-in.
   */
  async assertAvailable(code: string, forUnitId: string | null): Promise<void> {
    const matches = await this.findMatches(code);
    if (matches.some((version) => version.wardId !== forUnitId)) {
      throw new ConflictException(
        'That code is already in use by another unit. Choose a different code.',
      );
    }
  }
}
