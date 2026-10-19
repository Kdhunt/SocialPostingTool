import {
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type {
  PublicBulletinDto,
  PublicBulletinListResponse,
  PublicWardBulletinResponse,
} from '@ward-comms/validation';
import { assertPublicWardSlug } from '@ward-comms/domain';
import { NotFoundException } from '@nestjs/common';
import { WardRepository } from '../admin/repositories/ward.repository.js';
import { BulletinsService } from '../bulletins/bulletins.service.js';
import { PublicReadRateLimiterService } from './public-read-rate-limiter.service.js';
import { PublicWardBulletinService } from './public-ward-bulletin.service.js';

/**
 * Published bulletins may be served from the CDN for up to a minute, so an
 * unpublished bulletin can stay visible that long. Not-found and other errors
 * are never marked cacheable.
 */
const PUBLIC_BULLETIN_CACHE = 'public, max-age=60, s-maxage=60, stale-while-revalidate=300';

/**
 * Anonymous ward campaign board. No session. Does not accept or verify the
 * login ward code — lookup is by public slug only.
 */
@Controller('public/wards')
export class PublicWardBulletinController {
  constructor(
    @Inject(PublicWardBulletinService) private readonly bulletin: PublicWardBulletinService,
    @Inject(PublicReadRateLimiterService)
    private readonly rateLimiter: PublicReadRateLimiterService,
    @Inject(BulletinsService) private readonly bulletins: BulletinsService,
    @Inject(WardRepository) private readonly wards: WardRepository,
  ) {}

  @Get(':slug/campaigns')
  async list(
    @Param('slug') slug: string,
    @Req() req: Request,
  ): Promise<PublicWardBulletinResponse> {
    if (!this.rateLimiter.consume(`${req.ip}:public-bulletin`)) {
      throw new HttpException(
        'Too many requests. Please wait and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return this.bulletin.getBySlug(slug);
  }

  /** Published bulletins for the unit at this public path, newest first. */
  @Get(':slug/bulletins')
  async listBulletins(
    @Param('slug') slug: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicBulletinListResponse> {
    this.limit(req);
    const result = await this.bulletins.listPublic(await this.unitIdForSlug(slug));
    res.setHeader('Cache-Control', PUBLIC_BULLETIN_CACHE);
    return result;
  }

  /** One published bulletin: the page at /{slug}/{id} and its PDF. Drafts read as not found. */
  @Get(':slug/bulletins/:id')
  async getBulletin(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicBulletinDto> {
    this.limit(req);
    const result = await this.bulletins.getPublic(await this.unitIdForSlug(slug), id);
    // Only successful reads are cacheable, so a just-published bulletin never sticks as "not found".
    res.setHeader('Cache-Control', PUBLIC_BULLETIN_CACHE);
    return result;
  }

  private limit(req: Request): void {
    if (!this.rateLimiter.consumeBulletinRead(`${req.ip}:public-bulletin-read`)) {
      throw new HttpException(
        'Too many requests. Please wait and try again.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
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
