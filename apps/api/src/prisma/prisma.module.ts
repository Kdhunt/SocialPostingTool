import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

/**
 * Global so every feature module (auth, directory, audiences, campaigns,
 * delivery) can inject PrismaService without re-declaring this module.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
