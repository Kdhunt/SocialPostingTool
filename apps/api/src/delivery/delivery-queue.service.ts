import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis, { type Redis } from 'ioredis';
import type { AppConfig } from '@ward-comms/config';
import { DELIVERY_QUEUE_NAME, type DeliveryJobData, type DeliveryJobResult } from '@ward-comms/domain';
import { APP_CONFIG } from '../config/app-config.module.js';

@Injectable()
export class DeliveryQueueService implements OnModuleDestroy {
  private readonly connection: Redis;
  private readonly queue: Queue<DeliveryJobData, DeliveryJobResult>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.connection = new IORedis(config.redisUrl, { maxRetriesPerRequest: null, lazyConnect: true });
    this.queue = new Queue<DeliveryJobData, DeliveryJobResult>(DELIVERY_QUEUE_NAME, {
      connection: this.connection,
    });
  }

  async enqueue(deliveryRecipientId: string): Promise<void> {
    if (this.connection.status !== 'ready') {
      await this.connection.connect();
    }
    await this.queue.add(
      'deliver',
      { deliveryRecipientId },
      { jobId: deliveryRecipientId, attempts: 1, removeOnComplete: true, removeOnFail: 1000 },
    );
  }

  async onModuleDestroy(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
