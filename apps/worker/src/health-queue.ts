import { Queue, Worker, type ConnectionOptions } from 'bullmq';

export const HEALTH_QUEUE_NAME = 'ward-comms-worker-health';

export interface HealthJobData {
  requestedAt: string;
}

export interface HealthJobResult {
  respondedAt: string;
}

/**
 * Minimal BullMQ queue/worker pair used only to prove the Redis + BullMQ
 * connection shell works end to end. Real background jobs (delivery
 * dispatch, campaign scheduling, etc.) are added in later phases and must
 * not be added here without a corresponding phase and requirement
 * reference.
 */
export function createHealthQueue(
  connection: ConnectionOptions,
): Queue<HealthJobData, HealthJobResult> {
  return new Queue<HealthJobData, HealthJobResult>(HEALTH_QUEUE_NAME, { connection });
}

export function createHealthWorker(
  connection: ConnectionOptions,
): Worker<HealthJobData, HealthJobResult> {
  return new Worker<HealthJobData, HealthJobResult>(
    HEALTH_QUEUE_NAME,
    async (): Promise<HealthJobResult> => ({ respondedAt: new Date().toISOString() }),
    { connection },
  );
}
