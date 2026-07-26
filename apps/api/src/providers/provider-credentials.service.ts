import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { AppConfig } from '@ward-comms/config';
import type {
  ProviderCredentialListResponse,
  ProviderCredentialSummaryDto,
  UpsertProviderCredentialRequest,
} from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import { APP_CONFIG } from '../config/app-config.module.js';
import { encryptProviderSecret } from './provider-credential-cipher.js';
import { ProviderCredentialRepository } from './provider-credential.repository.js';

export interface ProviderCredentialActionContext {
  actorUserId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Stores encrypted provider credentials. Never returns plaintext secrets
 * (AGENTS.md #1/#3). Validates credentialsJson is parseable JSON only —
 * provider-specific schema checks happen in the worker adapters.
 */
@Injectable()
export class ProviderCredentialsService {
  constructor(
    @Inject(ProviderCredentialRepository) private readonly credentials: ProviderCredentialRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(wardId: string): Promise<ProviderCredentialListResponse> {
    const rows = await this.credentials.listForWard(wardId);
    return { credentials: rows.map((row) => this.toSummary(row)) };
  }

  async upsert(
    wardId: string,
    input: UpsertProviderCredentialRequest,
    context: ProviderCredentialActionContext,
  ): Promise<ProviderCredentialSummaryDto> {
    try {
      JSON.parse(input.credentialsJson);
    } catch {
      throw new BadRequestException('credentialsJson must be valid JSON.');
    }

    const encryptedPayload = encryptProviderSecret(
      input.credentialsJson,
      this.config.providerCredentialsEncryptionKey,
    );

    const row = await this.credentials.upsert({
      wardId,
      channel: input.channel,
      providerAccountReference: input.providerAccountReference,
      encryptedPayload,
      encryptionKeyId: 'v1',
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
    });

    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'provider_credential.upserted',
      entityType: 'ProviderCredential',
      entityId: row.id,
      metadata: { channel: input.channel, providerAccountReference: input.providerAccountReference },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });

    return this.toSummary(row);
  }

  async revoke(
    wardId: string,
    id: string,
    context: ProviderCredentialActionContext,
  ): Promise<void> {
    await this.credentials.revoke(wardId, id);
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action: 'provider_credential.revoked',
      entityType: 'ProviderCredential',
      entityId: id,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }

  private toSummary(row: {
    id: string;
    channel: string;
    providerAccountReference: string;
    encryptionKeyId: string;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ProviderCredentialSummaryDto {
    return {
      id: row.id,
      channel: row.channel as ProviderCredentialSummaryDto['channel'],
      providerAccountReference: row.providerAccountReference,
      encryptionKeyId: row.encryptionKeyId,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
