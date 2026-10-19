import { Controller, Get, HttpException, HttpStatus, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicBulletinDto, PublicBulletinListResponse, PublicWardBulletinResponse } from '@ward-comms/validation';
import { assertPublicWardSlug } from '@ward-comms/domain';
import { NotFoundException } from '@nestjs/common';
import { WardRepository } from '../admin/repositories/ward.repository.js';
import { BulletinsService } from '../bulletins/bulletins.service.js';
import { PublicReadRateLimiterService } from './public-read-rate-limiter.service.js';
import { PublicWardBulletinService } from './public-ward-bulletin.service.js';

/**
 * Anonymous ward campaign board. No session. Does not accept or verify the
 * login ward code — lookup is by public slug only.
 */
@Controller('public/wards')
export class PublicWardBulletinController {
  constructor(
    @Inject(PublicWardBulletinService) private readonly bulletin: PublicWardBulletinService,
    @Inject(PublicReadRateLimiterService) private readonly rateLimiter: PublicReadRateLimiterService,
    @Inject(BulletinsService) private readonly bulletins: BulletinsService,
    @Inject(WardRepository) private readonly wards: WardRepository,
  ) {}

  @Get(':slug/campaigns')
  async list(@Param('slug') slug: string, @Req() req: Request): Promise<PublicWardBulletinResponse> {
    if (!this.rateLimiter.consume(`${req.ip}:public-bulletin`)) {
      throw new HttpException('Too many requests. Please wait and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.bulletin.getBySlug(slug);
  }

  /** Published bulletins for the unit at this public path, newest first. */
  @Get(':slug/bulletins')
  async listBulletins(@Param('slug') slug: string, @Req() req: Request): Promise<PublicBulletinListResponse> {
    this.limit(req);
    return this.bulletins.listPublic(await this.unitIdForSlug(slug));
  }

  /** One published bulletin: the page at /{slug}/{id} and its PDF. Drafts read as not found. */
  @Get(':slug/bulletins/:id')
  async getBulletin(@Param('slug') slug: string, @Param('id') id: string, @Req() req: Request): Promise<PublicBulletinDto> {
    this.limit(req);
    return this.bulletins.getPublic(await this.unitIdForSlug(slug), id);
  }

  private limit(req: Request): void {
    if (!this.rateLimiter.consume(`${req.ip}:public-bulletin`)) {
      throw new HttpException('Too many requests. Please wait and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async unitIdForSlug(rawSlug: string): Promise<string> {
    let slug: string;
    try {
      slug = assertPublicWardSlug(rawSlug);
    } catch {
      throw new NotFoundException('Page not found.');
    }
    const unit = await this.wards.findActiveByPublicSlug(slug);
    if (!unit) throw new NotFoundException('Page not found.');
    return unit.id;
  }
}
