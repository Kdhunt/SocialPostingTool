import { Body, Controller, Get, Inject, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import {
  assignUserRolesRequestSchema,
  createUserRequestSchema,
  rotateWardCodeRequestSchema,
  type RoleListResponse,
  type UserListResponse,
  type UserSummaryDto,
  type WardCodeInfoDto,
} from '@ward-comms/validation';
import { parseBody } from '../common/parse-body.util.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermission } from '../auth/decorators/require-permission.decorator.js';
import { SessionAuthGuard, type AuthContext } from '../auth/guards/session-auth.guard.js';
import { PermissionsGuard } from '../auth/guards/permissions.guard.js';
import { UsersAdminService, type AdminActionContext } from './users-admin.service.js';
import { WardAdminService } from './ward-admin.service.js';

function buildContext(user: AuthContext['user'], req: Request): AdminActionContext {
  return { actorUserId: user.id, ipAddress: req.ip ?? null, userAgent: req.headers['user-agent'] ?? null };
}

@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('users')
export class UsersAdminController {
  constructor(@Inject(UsersAdminService) private readonly users: UsersAdminService) {}

  @RequirePermission('users.manage')
  @Get()
  async list(@CurrentUser() user: AuthContext['user']): Promise<UserListResponse> {
    return this.users.list(user.wardId);
  }

  @RequirePermission(['users.manage', 'roles.manage'])
  @Get('roles')
  async listRoles(): Promise<RoleListResponse> {
    return this.users.listRoles();
  }

  @RequirePermission('users.manage')
  @Post()
  async create(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<UserSummaryDto> {
    const dto = parseBody(createUserRequestSchema, body);
    return this.users.create(user.wardId, dto, buildContext(user, req));
  }

  @RequirePermission('roles.manage')
  @Put(':id/roles')
  async assignRoles(
    @Param('id') userId: string,
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<UserSummaryDto> {
    const dto = parseBody(assignUserRolesRequestSchema, body);
    return this.users.assignRoles(user.wardId, userId, dto.roleIds, buildContext(user, req));
  }
}

@UseGuards(SessionAuthGuard, PermissionsGuard)
@Controller('ward')
export class WardAdminController {
  constructor(@Inject(WardAdminService) private readonly ward: WardAdminService) {}

  @RequirePermission('ward.manage')
  @Get('code')
  async getCode(@CurrentUser() user: AuthContext['user']): Promise<WardCodeInfoDto | null> {
    return this.ward.getActiveCodeInfo(user.wardId);
  }

  @RequirePermission('ward.manage')
  @Post('code/rotate')
  async rotateCode(
    @Body() body: unknown,
    @CurrentUser() user: AuthContext['user'],
    @Req() req: Request,
  ): Promise<WardCodeInfoDto> {
    const dto = parseBody(rotateWardCodeRequestSchema, body);
    return this.ward.rotate(user.wardId, dto, buildContext(user, req));
  }
}
