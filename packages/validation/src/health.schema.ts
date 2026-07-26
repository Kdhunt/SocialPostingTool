import { z } from 'zod';

/**
 * Shared response contract for every app-level health endpoint (API, worker).
 * Kept intentionally small in Phase 2; extended per-app as real dependency
 * checks (database, redis, queue) are added.
 */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  service: z.string().min(1),
  timestamp: z.string().datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
