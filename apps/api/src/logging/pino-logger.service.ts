import type { LoggerService, LogLevel } from '@nestjs/common';
import pino, { type Logger as PinoLogger } from 'pino';

const SENSITIVE_KEYS = [
  'password',
  'wardCode',
  'ward_code',
  'sessionSecret',
  'refreshTokenSecret',
  'accessToken',
  'refreshToken',
  'authorization',
];

/**
 * Structured JSON logger adapting pino to Nest's LoggerService interface.
 * Redacts common secret-shaped keys so provider secrets, tokens, passwords,
 * and ward codes are never written to logs, per AGENTS.md and
 * .cursor/rules/security.mdc.
 */
export class PinoLoggerService implements LoggerService {
  private readonly logger: PinoLogger;

  constructor(serviceName: string) {
    this.logger = pino({
      base: { service: serviceName },
      redact: {
        paths: SENSITIVE_KEYS,
        censor: '[REDACTED]',
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });
  }

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.info({ context: this.contextFrom(optionalParams) }, this.stringify(message));
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.error({ context: this.contextFrom(optionalParams) }, this.stringify(message));
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.warn({ context: this.contextFrom(optionalParams) }, this.stringify(message));
  }

  debug?(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.debug({ context: this.contextFrom(optionalParams) }, this.stringify(message));
  }

  verbose?(message: unknown, ...optionalParams: unknown[]): void {
    this.logger.trace({ context: this.contextFrom(optionalParams) }, this.stringify(message));
  }

  setLogLevels?(_levels: LogLevel[]): void {
    // Level filtering is delegated to pino's own level configuration.
  }

  private stringify(message: unknown): string {
    return typeof message === 'string' ? message : JSON.stringify(message);
  }

  private contextFrom(optionalParams: unknown[]): string | undefined {
    const last = optionalParams[optionalParams.length - 1];
    return typeof last === 'string' ? last : undefined;
  }
}
