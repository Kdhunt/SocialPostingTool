import { describe, expect, it, vi } from 'vitest';
import { FacebookPageConnectionService } from './facebook-page-connection.service.js';
import type { FacebookGraphAdapter } from './facebook-graph.adapter.js';
import type { ProviderCredentialsService } from './provider-credentials.service.js';
import type { ProviderCredentialRepository } from './provider-credential.repository.js';
import type { CommunicationDestinationRepository } from '../audiences/repositories/communication-destination.repository.js';
import type { AuditService } from '../audit/audit.service.js';
import type { AppConfig } from '@ward-comms/config';

const context = { actorUserId: 'user-a', ipAddress: null, userAgent: null };

function buildService(overrides?: {
  findDestination?: ReturnType<typeof vi.fn>;
  createDestination?: ReturnType<typeof vi.fn>;
  upsert?: ReturnType<typeof vi.fn>;
  listActive?: ReturnType<typeof vi.fn>;
  revoke?: ReturnType<typeof vi.fn>;
  archive?: ReturnType<typeof vi.fn>;
}): FacebookPageConnectionService {
  const upsert = overrides?.upsert ?? vi.fn().mockResolvedValue({ id: 'cred-1' });
  const credentials = {
    upsert,
    revoke: overrides?.revoke ?? vi.fn().mockResolvedValue(undefined),
  } as unknown as ProviderCredentialsService;
  const credentialRows = {
    listActiveForWardChannel:
      overrides?.listActive ??
      vi.fn().mockResolvedValue([{ id: 'cred-1', providerAccountReference: '111' }]),
  } as unknown as ProviderCredentialRepository;
  const destinations = {
    findByWardChannelReference: overrides?.findDestination ?? vi.fn().mockResolvedValue(null),
    findByWardName: vi.fn().mockResolvedValue(null),
    create:
      overrides?.createDestination ??
      vi.fn().mockResolvedValue({ id: 'dest-1', name: 'Fictional Ward Page' }),
    restore: vi.fn(),
    archive: overrides?.archive ?? vi.fn(),
  } as unknown as CommunicationDestinationRepository;
  const graph = {} as FacebookGraphAdapter;
  const config = {
    facebook: { appId: undefined, appSecret: undefined },
    web: { url: 'https://www.wardcomms.online' },
    providerCredentialsEncryptionKey: 'k'.repeat(32),
    session: { secret: 's'.repeat(32) },
  } as unknown as AppConfig;
  const audit = { record: vi.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  return new FacebookPageConnectionService(credentials, credentialRows, destinations, graph, config, audit);
}

describe('FacebookPageConnectionService', () => {
  it('stores the page against the calling ward and creates a destination', async () => {
    const createDestination = vi.fn().mockResolvedValue({ id: 'dest-a', name: 'Fictional Ward Page' });
    const upsert = vi.fn().mockResolvedValue({ id: 'cred-a' });
    const service = buildService({ createDestination, upsert, findDestination: vi.fn().mockResolvedValue(null) });

    const connected = await service.connect(
      'ward-a',
      { pageId: '111', pageAccessToken: 'EAABwardA', pageName: 'Fictional Ward Page' },
      context,
    );

    expect(upsert).toHaveBeenCalledWith(
      'ward-a',
      expect.objectContaining({ channel: 'FacebookPage', providerAccountReference: '111' }),
      context,
    );
    expect(createDestination).toHaveBeenCalledWith(
      expect.objectContaining({
        wardId: 'ward-a',
        channel: 'FacebookPage',
        providerAccountReference: '111',
      }),
    );
    expect(connected.pageId).toBe('111');
    expect(connected.destinationId).toBe('dest-a');
  });

  it('lists only the calling ward’s connected pages', async () => {
    const listActive = vi.fn().mockResolvedValue([{ id: 'cred-b', providerAccountReference: '222' }]);
    const findDestination = vi.fn().mockResolvedValue({
      id: 'dest-b',
      name: 'Other Ward Page',
      archivedAt: null,
    });
    const service = buildService({ listActive, findDestination });

    const listed = await service.list('ward-b');
    expect(listActive).toHaveBeenCalledWith('ward-b', 'FacebookPage');
    expect(listed.connections).toEqual([
      { pageId: '222', pageName: 'Other Ward Page', destinationId: 'dest-b', credentialId: 'cred-b' },
    ]);
  });

  it('revokes only the calling ward’s credential for that page id', async () => {
    const revoke = vi.fn().mockResolvedValue(undefined);
    const archive = vi.fn();
    const listActive = vi.fn().mockResolvedValue([{ id: 'cred-a', providerAccountReference: '111' }]);
    const service = buildService({
      listActive,
      revoke,
      archive,
      findDestination: vi.fn().mockResolvedValue({ id: 'dest-a', archivedAt: null }),
    });

    await service.disconnect('ward-a', '111', context);

    expect(listActive).toHaveBeenCalledWith('ward-a', 'FacebookPage');
    expect(revoke).toHaveBeenCalledWith('ward-a', 'cred-a', context);
    expect(archive).toHaveBeenCalledWith('dest-a');
  });

  it('refuses a pending OAuth page list from another ward', () => {
    const service = buildService();
    const encoded = service.encodePendingOauthPages('ward-a', [
      { pageId: '111', pageName: 'Fictional Ward A Page', pageAccessToken: 'token-a' },
    ]);

    expect(() => service.decodePendingOauthPages(encoded, 'ward-b')).toThrow(/different ward/);
    expect(service.decodePendingOauthPages(encoded, 'ward-a')).toEqual([
      { pageId: '111', pageName: 'Fictional Ward A Page', pageAccessToken: 'token-a' },
    ]);
  });
});
