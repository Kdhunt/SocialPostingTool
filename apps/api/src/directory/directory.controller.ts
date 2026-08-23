import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  addHouseholdMembershipRequestSchema,
  createContactMethodRequestSchema,
  createHouseholdRequestSchema,
  createPersonRequestSchema,
  createRelationshipRequestSchema,
  personSearchQuerySchema,
  updateConsentRequestSchema,
  updateContactMethodRequestSchema,
  updateHouseholdRequestSchema,
  updatePersonRequestSchema,
  type HouseholdDetailDto,
  type HouseholdListResponse,
  type PersonDetailDto,
  type PersonListResponse,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { DirectoryService, MINORS_CONTACT_READ_PERMISSION } from './directory.service.js';

function buildContext(user: AuthContext['user'], req: Request): { actorUserId: string; ipAddress: string | null; userAgent: string | null } {
  return { actorUserId: user.id, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

/**
 * Thin controller for the Phase 5 directory. Every route is guarded
 * server-side by `SessionAuthGuard` (who is calling) and
 * `PermissionsGuard` + `@RequirePermission(...)` (what they may do) — the
 * frontend's own view of permissions is never trusted (AGENTS.md #4). All
 * business logic lives in `DirectoryService` / `@ward-comms/domain`.
 */
@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('directory')
export class DirectoryController {
  constructor(@Inject(DirectoryService) private readonly directory: DirectoryService) {}

  @RequirePermission('directory.read')
  @Get('people')
  async searchPeople(
    @Query() query: unknown,
    @CurrentUser() user: AuthContext['user'],
  ): Promise<PersonListResponse> {
    const dto = parseBody(personSearchQuerySchema, query);
    const people = await this.directory.searchPeople(user.wardId, dto);
    return { people };
  }

  @RequirePermission('directory.read')
  @Get('people/:id')
  async getPerson(@Param('id') id: string, @CurrentUser() user: AuthContext['user']): Promise<PersonDetailDto> {
    return this.directory.getPerson(user.wardId, id, user.permissions.includes(MINORS_CONTACT_READ_PERMISSION));
  }

  @RequirePermission('directory.write')
  @Post('people')
  async createPerson(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    const dto = parseBody(createPersonRequestSchema, body);
    return this.directory.createPerson(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Patch('people/:id')
  async updatePerson(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    const dto = parseBody(updatePersonRequestSchema, body);
    return this.directory.updatePerson(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Post('people/:id/archive')
  async archivePerson(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.directory.archivePerson(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }

  @RequirePermission('directory.write')
  @Post('people/:id/restore')
  async restorePerson(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.directory.restorePerson(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }

  @RequirePermission('directory.write')
  @Post('people/:id/contact-methods')
  async addContactMethod(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    const dto = parseBody(createContactMethodRequestSchema, body);
    return this.directory.addContactMethod(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Patch('people/:id/contact-methods/:contactMethodId')
  async updateContactMethod(
    @Param('id') id: string,
    @Param('contactMethodId') contactMethodId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    const dto = parseBody(updateContactMethodRequestSchema, body);
    return this.directory.updateContactMethod(user.wardId, id, contactMethodId, dto, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Delete('people/:id/contact-methods/:contactMethodId')
  async archiveContactMethod(
    @Param('id') id: string,
    @Param('contactMethodId') contactMethodId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    return this.directory.archiveContactMethod(user.wardId, id, contactMethodId, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Patch('people/:id/contact-methods/:contactMethodId/consent')
  async setConsent(
    @Param('id') id: string,
    @Param('contactMethodId') contactMethodId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    const dto = parseBody(updateConsentRequestSchema, body);
    return this.directory.setConsent(user.wardId, id, contactMethodId, dto, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Post('people/:id/relationships')
  async addRelationship(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    const dto = parseBody(createRelationshipRequestSchema, body);
    return this.directory.addRelationship(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Delete('people/:id/relationships/:relationshipId')
  async archiveRelationship(
    @Param('id') id: string,
    @Param('relationshipId') relationshipId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    return this.directory.archiveRelationship(user.wardId, id, relationshipId, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Post('people/:id/household-memberships')
  async addHouseholdMembership(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    const dto = parseBody(addHouseholdMembershipRequestSchema, body);
    return this.directory.addHouseholdMembership(
      user.wardId,
      id,
      dto.householdId,
      dto.householdRole,
      dto.endOtherCurrentMemberships ?? false,
      buildContext(user, req),
    );
  }

  @RequirePermission('directory.write')
  @Delete('people/:id/household-memberships/:membershipId')
  async endHouseholdMembership(
    @Param('id') id: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<PersonDetailDto> {
    return this.directory.endHouseholdMembership(user.wardId, id, membershipId, buildContext(user, req));
  }

  @RequirePermission('directory.read')
  @Get('households')
  async listHouseholds(
    @Query('includeInactive') includeInactive: string | undefined,
    @CurrentUser() user: AuthContext['user'],
  ): Promise<HouseholdListResponse> {
    const households = await this.directory.listHouseholds(user.wardId, includeInactive === 'true');
    return {
      households: households.map((household) => ({
        id: household.id,
        name: household.name,
        isActive: household.isActive,
        memberCount: household.members.length,
      })),
    };
  }

  @RequirePermission('directory.read')
  @Get('households/:id')
  async getHousehold(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
  ): Promise<HouseholdDetailDto> {
    return this.directory.getHousehold(user.wardId, id);
  }

  @RequirePermission('directory.write')
  @Post('households')
  async createHousehold(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<HouseholdDetailDto> {
    const dto = parseBody(createHouseholdRequestSchema, body);
    return this.directory.createHousehold(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Patch('households/:id')
  async updateHousehold(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<HouseholdDetailDto> {
    const dto = parseBody(updateHouseholdRequestSchema, body);
    return this.directory.updateHousehold(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('directory.write')
  @Post('households/:id/archive')
  async archiveHousehold(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<{ ok: true }> {
    await this.directory.archiveHousehold(user.wardId, id, buildContext(user, req));
    return { ok: true };
  }
}
