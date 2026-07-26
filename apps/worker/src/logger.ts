import pino from 'pino';

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
 * Structured JSON logger for the worker process. Redacts secret-shaped
 * keys so provider secrets, tokens, passwords, and ward codes are never
 * written to logs, per AGENTS.md and .cursor/rules/security.mdc.
 */
export const logger = pino({
  base: { service: '@ward-comms/worker' },
  redact: {
    paths: SENSITIVE_KEYS,
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
