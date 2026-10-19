import { describe, expect, it, vi } from 'vitest';
import type { WardCodeVersion } from '@prisma/client';
import type { AppConfig } from '@ward-comms/config';
import { WardCodeHasherService } from './ward-code-hasher.service.js';
import { LEGACY_CODE_SCAN_LIMIT, UnitCodeLookupService } from './unit-code-lookup.service.js';
import type { WardCodeRepository } from './repositories/ward-code.repository.js';

const config = { wardCodePepper: 'fictional-pepper-value-123456' } as AppConfig;

function version(
  id: string,
  wardId: string,
  codeHash: string,
  lookupKey: string | null,
): WardCodeVersion {
  return {
    id,
    wardId,
    version: 1,
    codeHash,
    lookupKey,
    createdAt: new Date(),
    activatedAt: new Date(),
    retiredAt: null,
  };
}

function fakeRepo(
  keyed: WardCodeVersion[],
  legacy: WardCodeVersion[],
): WardCodeRepository & {
  setLookupKey: ReturnType<typeof vi.fn>;
  listActiveVersionsWithoutLookupKey: ReturnType<typeof vi.fn>;
} {
  return {
    findActiveByLookupKey: vi.fn(async (key: string) =>
      keyed.filter((row) => row.lookupKey === key),
    ),
    listActiveVersionsWithoutLookupKey: vi.fn(async (limit: number) => legacy.slice(0, limit)),
    setLookupKey: vi.fn(async () => undefined),
  } as unknown as WardCodeRepository & {
    setLookupKey: ReturnType<typeof vi.fn>;
    listActiveVersionsWithoutLookupKey: ReturnType<typeof vi.fn>;
  };
}

describe('UnitCodeLookupService', () => {
  it('spends exactly one Argon2 verify whether or not the code matches a unit', async () => {
    const hasher = new WardCodeHasherService(config);
    const code = 'fictional-stake-code';
    const keyed = [version('v1', 'stake', await hasher.hash(code), hasher.lookupKey(code))];
    const repo = fakeRepo(keyed, []);
    const service = new UnitCodeLookupService(repo, hasher);

    const verify = vi.spyOn(hasher, 'verify');
    const dummy = vi.spyOn(hasher, 'verifyAgainstDummy');

    expect(await service.resolve(code)).toMatchObject({
      kind: 'one',
      version: { wardId: 'stake' },
    });
    expect(verify).toHaveBeenCalledTimes(1);
    expect(dummy).not.toHaveBeenCalled();

    verify.mockClear();
    expect(await service.resolve('no-such-code')).toEqual({ kind: 'none' });
    // The miss path still does one real verify (inside verifyAgainstDummy).
    expect(dummy).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledTimes(1);
    expect(repo.listActiveVersionsWithoutLookupKey).toHaveBeenCalledWith(LEGACY_CODE_SCAN_LIMIT);
  });

  it('skips the legacy scan when the keyed lookup matches, and backfills keys on a legacy hit', async () => {
    const hasher = new WardCodeHasherService(config);
    const keyedCode = 'fictional-keyed-code';
    const legacyCode = 'fictional-legacy-code';
    const keyed = [
      version('k', 'ward-k', await hasher.hash(keyedCode), hasher.lookupKey(keyedCode)),
    ];
    const legacy = [version('l', 'ward-l', await hasher.hash(legacyCode), null)];
    const repo = fakeRepo(keyed, legacy);
    const service = new UnitCodeLookupService(repo, hasher);

    await service.resolve(keyedCode);
    expect(repo.listActiveVersionsWithoutLookupKey).not.toHaveBeenCalled();

    expect(await service.resolve(legacyCode)).toMatchObject({
      kind: 'one',
      version: { wardId: 'ward-l' },
    });
    expect(repo.setLookupKey).toHaveBeenCalledWith('l', hasher.lookupKey(legacyCode));
  });

  it('reports an ambiguous code instead of picking a unit', async () => {
    const hasher = new WardCodeHasherService(config);
    const code = 'fictional-shared-code';
    const keyed = [
      version('a', 'ward-a', await hasher.hash(code), hasher.lookupKey(code)),
      version('b', 'ward-b', await hasher.hash(code), hasher.lookupKey(code)),
    ];
    const service = new UnitCodeLookupService(fakeRepo(keyed, []), hasher);
    expect(await service.resolve(code)).toEqual({
      kind: 'ambiguous',
      unitIds: ['ward-a', 'ward-b'],
    });
    await expect(service.assertAvailable(code, 'ward-a')).rejects.toThrow(/already in use/i);
  });
});
