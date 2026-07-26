import { Inject, Injectable } from '@nestjs/common';
import type { ApplicationUser } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UserPermissions {
  user: ApplicationUser;
  permissionKeys: string[];
}

/**
 * Prisma-backed repository for ApplicationUser. Contains no authorization
 * or authentication *decisions* — those live in AuthService and
 * packages/domain — only data access.
 */
@Injectable()
export class UserRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Looks up an active (not archived) user by username. Username is not
   * globally unique in the schema (`@@unique([wardId, username])`), so
   * this is a best-effort global lookup for the single-ward-per-login-form
   * MVP; a production multi-ward deployment should scope this by ward
   * (e.g. a ward slug on the login form) to avoid ambiguity.
   */
  async findActiveByUsername(username: string): Promise<ApplicationUser | null> {
    return this.prisma.client.applicationUser.findFirst({
      where: { username, archivedAt: null },
    });
  }

  async findById(id: string): Promise<ApplicationUser | null> {
    return this.prisma.client.applicationUser.findUnique({ where: { id } });
  }

  async recordFailedLogin(userId: string, failedLoginAttempts: number, lockedUntil: Date | null): Promise<void> {
    await this.prisma.client.applicationUser.update({
      where: { id: userId },
      data: { failedLoginAttempts, lastFailedLoginAt: new Date(), lockedUntil },
    });
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.prisma.client.applicationUser.update({
      where: { id: userId },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
  }

  async disable(userId: string): Promise<void> {
    await this.prisma.client.applicationUser.update({
      where: { id: userId },
      data: { disabledAt: new Date() },
    });
  }

  async enable(userId: string): Promise<void> {
    await this.prisma.client.applicationUser.update({
      where: { id: userId },
      data: { disabledAt: null },
    });
  }

  async getPermissionKeys(userId: string): Promise<string[]> {
    const userRoles = await this.prisma.client.userRole.findMany({
      where: { userId },
      include: { role: { include: { rolePermissions: { include: { permission: true } } } } },
    });

    const keys = new Set<string>();
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        keys.add(rolePermission.permission.key);
      }
    }
    return [...keys];
  }

  async listForWard(wardId: string): Promise<
    Array<{
      id: string;
      username: string;
      displayName: string;
      disabledAt: Date | null;
      lastLoginAt: Date | null;
      roles: Array<{ id: string; name: string }>;
    }>
  > {
    const users = await this.prisma.client.applicationUser.findMany({
      where: { wardId, archivedAt: null },
      orderBy: { username: 'asc' },
      include: { roles: { include: { role: true } } },
    });
    return users.map((user) => ({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      disabledAt: user.disabledAt,
      lastLoginAt: user.lastLoginAt,
      roles: user.roles.map((userRole) => ({ id: userRole.role.id, name: userRole.role.name })),
    }));
  }

  async findByIdForWard(wardId: string, userId: string): Promise<ApplicationUser | null> {
    return this.prisma.client.applicationUser.findFirst({
      where: { id: userId, wardId, archivedAt: null },
    });
  }

  async create(input: {
    wardId: string;
    username: string;
    displayName: string;
    passwordHash: string;
    roleIds: string[];
  }): Promise<ApplicationUser> {
    return this.prisma.client.$transaction(async (tx) => {
      const user = await tx.applicationUser.create({
        data: {
          wardId: input.wardId,
          username: input.username,
          displayName: input.displayName,
          passwordHash: input.passwordHash,
          passwordUpdatedAt: new Date(),
        },
      });
      await tx.userRole.createMany({
        data: input.roleIds.map((roleId) => ({ userId: user.id, roleId })),
      });
      return user;
    });
  }

  async assignRoles(userId: string, roleIds: string[]): Promise<void> {
    await this.prisma.client.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      await tx.userRole.createMany({
        data: roleIds.map((roleId) => ({ userId, roleId })),
      });
    });
  }

  async isUsernameTaken(wardId: string, username: string): Promise<boolean> {
    const existing = await this.prisma.client.applicationUser.findFirst({
      where: { wardId, username, archivedAt: null },
    });
    return existing !== null;
  }
}
