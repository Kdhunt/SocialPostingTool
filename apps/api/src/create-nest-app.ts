import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter, type NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import { loadConfig } from '@ward-comms/config';
import { AppModule } from './app.module.js';
import { PinoLoggerService } from './logging/pino-logger.service.js';

export async function createNestExpressApp(): Promise<Express> {
  const config = loadConfig();
  const expressApp = express();

  if (config.nodeEnv === 'production' || process.env.VERCEL) {
    expressApp.set('trust proxy', 1);
  }

  const adapter = new ExpressAdapter(expressApp);

  const nestApp = await NestFactory.create<NestExpressApplication>(AppModule, adapter, {
    logger: new PinoLoggerService('@ward-comms/api'),
  });

  if (process.env.VERCEL) {
    nestApp.setGlobalPrefix('api/v1');
  }

  // A full bulletin save (up to 40 rich-text sections) is larger than Express's
  // 100 KB default. Vercel itself caps request bodies at 4.5 MB.
  nestApp.useBodyParser('json', { limit: '2mb' });
  nestApp.use(cookieParser());
  nestApp.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
  });

  await nestApp.init();
  return expressApp;
}
