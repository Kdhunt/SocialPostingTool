import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import type { AppConfig } from '@ward-comms/config';
import { OUTBOUND_QUEUE_NAME, type OutboundJobData, type OutboundJobResult } from '@ward-comms/domain';
import { APP_CONFIG } from '../config/app-config.module.js';

@Injectable()
export class OutboundQueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<OutboundJobData, OutboundJobResult>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
    this.queue = new Queue<OutboundJobData, OutboundJobResult>(OUTBOUND_QUEUE_NAME, {
      connection: this.connection,
    });
  }

  async enqueue(outboundMessageId: string): Promise<void> {
    if (this.connection.status !== 'ready') {
      await this.connection.connect();
    }
    await this.queue.add(
      'outbound',
      { outboundMessageId },
      { jobId: outboundMessageId, attempts: 1, removeOnComplete: true, removeOnFail: 1000 },
    );
  }

  async enqueueRetry(outboundMessageId: string, delayMs: number): Promise<void> {
    if (this.connection.status !== 'ready') {
      await this.connection.connect();
    }
    await this.queue.add(
      'outbound',
      { outboundMessageId },
      { delay: delayMs, jobId: `${outboundMessageId}:retry:${Date.now()}`, attempts: 1, removeOnComplete: true },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
