import { Module } from '@nestjs/common';
import { loadConfig, type AppConfig } from '@ward-comms/config';

export const APP_CONFIG = Symbol('APP_CONFIG');

/**
 * Validates process.env once at startup via @ward-comms/config and exposes
 * the resulting typed AppConfig for injection. Fails fast (throws during
 * module initialization) on invalid or missing configuration rather than
 * booting with unsafe defaults.
 */
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => loadConfig(),
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
