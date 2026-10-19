import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { normalizeOrganizationName } from '@ward-comms/domain';
import type { UnitOrganizationDto, UnitOrganizationListResponse } from '@ward-comms/validation';
import { AuditService } from '../audit/audit.service.js';
import type { BulletinActionContext } from './bulletins.service.js';
import {
  OrganizationNameConflictError,
  UnitOrganizationRepository,
} from './repositories/unit-organization.repository.js';

/** The named organizations (Relief Society, Primary, ...) a unit files bulletin sections under. */
@Injectable()
export class UnitOrganizationsService {
  constructor(
    @Inject(UnitOrganizationRepository) private readonly organizations: UnitOrganizationRepository,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  async list(wardId: string): Promise<UnitOrganizationListResponse> {
    const rows = await this.organizations.listActive(wardId);
    return { organizations: rows.map((row) => this.toDto(row)) };
  }

  async create(
    wardId: string,
    rawName: string,
    context: BulletinActionContext,
  ): Promise<UnitOrganizationDto> {
    const name = this.normalize(rawName);
    const created = await this.unique(() => this.organizations.saveUniqueName(wardId, name, null));
    await this.record(wardId, context, 'organization.created', created.id, { name });
    return this.toDto(created);
  }

  async rename(
    wardId: string,
    id: string,
    rawName: string,
    context: BulletinActionContext,
  ): Promise<UnitOrganizationDto> {
    const name = this.normalize(rawName);
    const target = await this.organizations.findForWard(wardId, id);
    if (!target || target.archivedAt) throw new NotFoundException('Organization not found.');
    const updated = await this.unique(() => this.organizations.saveUniqueName(wardId, name, id));
    await this.record(wardId, context, 'organization.renamed', id, { from: target.name, to: name });
    return this.toDto(updated);
  }

  /** Hides the organization from new sections. Existing sections keep showing its name. */
  async archive(wardId: string, id: string, context: BulletinActionContext): Promise<void> {
    const target = await this.organizations.findForWard(wardId, id);
    if (!target || target.archivedAt) throw new NotFoundException('Organization not found.');
    await this.organizations.archive(id);
    await this.record(wardId, context, 'organization.archived', id, { name: target.name });
  }

  private async unique<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof OrganizationNameConflictError) {
        throw new ConflictException('An organization with that name already exists.');
      }
      throw error;
    }
  }

  private normalize(rawName: string): string {
    const name = normalizeOrganizationName(rawName);
    if (!name) throw new BadRequestException('Enter a name of up to 80 characters.');
    return name;
  }

  private toDto(row: { id: string; name: string; sortOrder: number }): UnitOrganizationDto {
    return { id: row.id, name: row.name, sortOrder: row.sortOrder };
  }

  private async record(
    wardId: string,
    context: BulletinActionContext,
    action: string,
    organizationId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      wardId,
      actorUserId: context.actorUserId,
      action,
      entityType: 'UnitOrganization',
      entityId: organizationId,
      metadata,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    });
  }
}
