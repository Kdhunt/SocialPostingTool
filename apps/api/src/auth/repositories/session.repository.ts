import { Inject, Injectable } from '@nestjs/common';
import type { UserSession } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface CreateSessionInput {
  userId: string;
  sessionTokenHash: string;
  refreshTokenHash?: string | null;
  deviceId: string;
  /** Null when the ward has not configured a ward code yet. */
  wardCodeVersionId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
}

@Injectable()
export class SessionRepository {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(input: CreateSessionInput): Promise<UserSession> {
    return this.prisma.client.userSession.create({
      data: {
        userId: input.userId,
        sessionTokenHash: input.sessionTokenHash,
        refreshTokenHash: input.refreshTokenHash ?? null,
        deviceId: input.deviceId,
        wardCodeVersionId: input.wardCodeVersionId ?? null,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findByTokenHash(sessionTokenHash: string): Promise<UserSession | null> {
    return this.prisma.client.userSession.findUnique({ where: { sessionTokenHash } });
  }

  async findByRefreshTokenHash(refreshTokenHash: string): Promise<UserSession | null> {
    return this.prisma.client.userSession.findUnique({ where: { refreshTokenHash } });
  }

  async findById(id: string): Promise<UserSession | null> {
    return this.prisma.client.userSession.findUnique({ where: { id } });
  }

  async findLatestVerifiedForDevice(userId: string, deviceId: string): Promise<UserSession | null> {
    return this.prisma.client.userSession.findFirst({
      where: { userId, deviceId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async listActiveForUser(userId: string): Promise<UserSession[]> {
    return this.prisma.client.userSession.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.prisma.client.userSession.update({ where: { id }, data: { lastUsedAt: new Date() } });
  }

  async rotateRefreshToken(id: string, refreshTokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.client.userSession.update({
      where: { id },
      data: { refreshTokenHash, expiresAt, lastUsedAt: new Date() },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.client.userSession.update({ where: { id }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.client.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
