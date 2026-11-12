import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

import { settings } from '../config';

export interface JobSnapshot {
  state: string;
  attemptsMade: number;
  failedReason?: string;
}

export class StockQueue {
  private readonly connection = new Redis({ ...settings.redis, maxRetriesPerRequest: null });
  private readonly queue = new Queue(settings.queue, { connection: this.connection });

  constructor() {
    this.connection.on('error', () => undefined);
  }

  async job(orderId: string): Promise<JobSnapshot | undefined> {
    const job = await this.queue.getJob(orderId);
    if (!job) return undefined;
    return { state: await job.getState(), attemptsMade: job.attemptsMade, failedReason: job.failedReason };
  }

  async close(): Promise<void> {
    await this.queue.close();
    this.connection.disconnect();
  }
}
