import { ConflictException, Inject, Injectable } from '@nestjs/common';
import type { WardCodeVersion } from '@prisma/client';
import { WardCodeRepository } from './repositories/ward-code.repository.js';
import { WardCodeHasherService } from './ward-code-hasher.service.js';

/**
 * How many code rows without a lookup key sign-in will still Argon2-check per
 * attempt. Rows get their key on first successful sign-in or on rotation, so
 * this set only exists right after upgrading; the bound keeps a bad actor from
 * turning the scan into a CPU drain. Units past the bound must rotate their
 * code once (docs/unit-hierarchy.md, "Upgrading").
 */
export const LEGACY_CODE_SCAN_LIMIT = 16;

export type UnitCodeResolution =
  | { kind: 'none' }
  | { kind: 'one'; version: WardCodeVersion }
  | { kind: 'ambiguous'; unitIds: string[] };

/**
 * Finds which unit (ward, stake, region or district) a sign-in code belongs
 * to. Codes are matched through the indexed lookup key, then confirmed with
 * the Argon2 hash. Rows created before lookup keys existed are checked only
 * when the keyed lookup misses, up to LEGACY_CODE_SCAN_LIMIT, and get their
 * key backfilled on first match.
 *
 * Every call does at least one Argon2 verify, so the time taken does not
 * reveal whether the code belonged to a real unit.
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

    const matches: WardCodeVersion[] = [];
    for (const version of keyed) {
      if (await this.hasher.verify(version.codeHash, code)) {
        matches.push(version);
      }
    }
    if (keyed.length > 0) {
      return matches;
    }

    const legacy = await this.wardCodes.listActiveVersionsWithoutLookupKey(LEGACY_CODE_SCAN_LIMIT);
    for (const version of legacy) {
      if (await this.hasher.verify(version.codeHash, code)) {
        matches.push(version);
        await this.wardCodes.setLookupKey(version.id, lookupKey);
      }
    }
    if (legacy.length === 0) {
      await this.hasher.verifyAgainstDummy(code);
    }
    return matches;
  }

  /** The single unit this code signs in to, or why there is none. */
  async resolve(code: string): Promise<UnitCodeResolution> {
    const matches = await this.findMatches(code);
    const [first] = matches;
    if (matches.length === 1 && first) {
      return { kind: 'one', version: first };
    }
    if (matches.length > 1) {
      return { kind: 'ambiguous', unitIds: matches.map((version) => version.wardId) };
    }
    return { kind: 'none' };
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
