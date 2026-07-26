import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { loadConfig } from '@ward-comms/config';
import { AppModule } from './app.module.js';
import { PinoLoggerService } from './logging/pino-logger.service.js';

async function bootstrap(): Promise<void> {
  // Fail fast on invalid/missing environment configuration before the Nest
  // application context (and its modules) are even created.
  const config = loadConfig();

  const app = await NestFactory.create(AppModule, {
    logger: new PinoLoggerService('@ward-comms/api'),
  });

  app.enableCors({
    origin: config.corsAllowedOrigins,
    credentials: true,
  });

  await app.listen(config.api.port, config.api.host);
}

bootstrap().catch((error: unknown) => {
  console.error('Failed to start @ward-comms/api', error);
  process.exitCode = 1;
});
