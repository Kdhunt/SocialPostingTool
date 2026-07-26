import { BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates a request body against a shared @ward-comms/validation zod
 * schema and returns the parsed, typed value, or throws a 400 with a
 * readable (but never secret-containing) error list. Keeps controllers
 * thin: no business logic lives here, only request-shape validation.
 */
export function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new BadRequestException({ message: 'Validation failed', issues });
  }
  return result.data;
}
