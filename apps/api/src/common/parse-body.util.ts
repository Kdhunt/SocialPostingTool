import { BadRequestException } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';

/**
 * Validates a request body against a shared @ward-comms/validation zod
 * schema and returns the parsed, typed value, or throws a 400 with a
 * readable (but never secret-containing) error list. Keeps controllers
 * thin: no business logic lives here, only request-shape validation.
 * Typed by the schema's output, so schemas that transform their input
 * (such as query-string flags) come back with the transformed type.
 */
export function parseBody<S extends ZodTypeAny>(schema: S, body: unknown): z.output<S> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new BadRequestException({ message: 'Validation failed', issues });
  }
  return result.data;
}
