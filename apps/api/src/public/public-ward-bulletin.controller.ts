import { Controller, Get, HttpException, HttpStatus, Inject, Param, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { PublicWardBulletinResponse } from '@ward-comms/validation';
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
  ) {}

  @Get(':slug/campaigns')
  async list(@Param('slug') slug: string, @Req() req: Request): Promise<PublicWardBulletinResponse> {
    if (!this.rateLimiter.consume(`${req.ip}:public-bulletin`)) {
      throw new HttpException('Too many requests. Please wait and try again.', HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.bulletin.getBySlug(slug);
  }
}
