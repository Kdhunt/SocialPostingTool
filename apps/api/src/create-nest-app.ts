import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
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

  const nestApp = await NestFactory.create(AppModule, adapter, {
    logger: new PinoLoggerService('@ward-comms/api'),
  });

  nestApp.use(cookieParser());
  nestApp.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
  });

  await nestApp.init();
  return expressApp;
}
