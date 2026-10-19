import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  copyBulletinAsLanguageRequestSchema,
  createBulletinRequestSchema,
  saveBulletinRequestSchema,
  saveUnitOrganizationRequestSchema,
  type BulletinDetailDto,
  type BulletinListResponse,
  type UnitOrganizationDto,
  type UnitOrganizationListResponse,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { BulletinsService, type BulletinActionContext } from './bulletins.service.js';
import { UnitOrganizationsService } from './unit-organizations.service.js';

function buildContext(user: AuthContext['user'], req: Request): BulletinActionContext {
  return {
    actorUserId: user.id,
    permissions: user.permissions,
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

const READ = ['campaigns.create', 'campaigns.approve', 'campaigns.send'];

/**
 * Bulletins for the signed-in user's unit. Drafting needs `campaigns.create`;
 * publishing, unpublishing and editing a live bulletin need `campaigns.send`.
 */
@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('bulletins')
export class BulletinsController {
  constructor(@Inject(BulletinsService) private readonly bulletins: BulletinsService) {}

  @RequirePermission(READ)
  @Get()
  async list(@CurrentUser() user: AuthContext['user']): Promise<BulletinListResponse> {
    return this.bulletins.list(user.wardId);
  }

  @RequirePermission(READ)
  @Get(':id')
  async get(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
  ): Promise<BulletinDetailDto> {
    return this.bulletins.get(user.wardId, id);
  }

  @RequirePermission('campaigns.create')
  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<BulletinDetailDto> {
    const dto = parseBody(createBulletinRequestSchema, body);
    return this.bulletins.create(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Put(':id')
  async save(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<BulletinDetailDto> {
    const dto = parseBody(saveBulletinRequestSchema, body);
    return this.bulletins.save(user.wardId, id, dto, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Post(':id/editions')
  async copyAsLanguage(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<BulletinDetailDto> {
    const dto = parseBody(copyBulletinAsLanguageRequestSchema, body);
    return this.bulletins.copyAsLanguage(user.wardId, id, dto.language, buildContext(user, req));
  }

  @RequirePermission('campaigns.send')
  @Post(':id/publish')
  @HttpCode(200)
  async publish(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<BulletinDetailDto> {
    return this.bulletins.publish(user.wardId, id, buildContext(user, req));
  }

  @RequirePermission('campaigns.send')
  @Post(':id/unpublish')
  @HttpCode(200)
  async unpublish(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<BulletinDetailDto> {
    return this.bulletins.unpublish(user.wardId, id, buildContext(user, req));
  }

  @RequirePermission('campaigns.create')
  @Delete(':id')
  @HttpCode(204)
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    await this.bulletins.archive(user.wardId, id, buildContext(user, req));
  }
}

/** The organizations a unit files bulletin sections under. Managing them needs `ward.manage`. */
@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('organizations')
export class UnitOrganizationsController {
  constructor(
    @Inject(UnitOrganizationsService) private readonly organizations: UnitOrganizationsService,
  ) {}

  @RequirePermission([...READ, 'ward.manage'])
  @Get()
  async list(@CurrentUser() user: AuthContext['user']): Promise<UnitOrganizationListResponse> {
    return this.organizations.list(user.wardId);
  }

  @RequirePermission('ward.manage')
  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<UnitOrganizationDto> {
    const dto = parseBody(saveUnitOrganizationRequestSchema, body);
    return this.organizations.create(user.wardId, dto.name, buildContext(user, req));
  }

  @RequirePermission('ward.manage')
  @Patch(':id')
  async rename(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<UnitOrganizationDto> {
    const dto = parseBody(saveUnitOrganizationRequestSchema, body);
    return this.organizations.rename(user.wardId, id, dto.name, buildContext(user, req));
  }

  @RequirePermission('ward.manage')
  @Delete(':id')
  @HttpCode(204)
  async archive(
    @Param('id') id: string,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<void> {
    await this.organizations.archive(user.wardId, id, buildContext(user, req));
  }
}
