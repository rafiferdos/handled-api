import { Inject, Injectable, Logger } from '@nestjs/common';
import type { OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
import type { ConnectionOptions } from 'bullmq';
import { AppException } from '../../common/errors/app.exception.js';
import { OutboxDispatcher } from './outbox-dispatcher.js';

export function redisConnection(value: string): ConnectionOptions {
  const url = new URL(value);
  if (!['redis:', 'rediss:'].includes(url.protocol) || url.search || url.hash)
    throw new AppException('DEPENDENCY_UNAVAILABLE');
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(db) || db < 0 || db > 15)
    throw new AppException('DEPENDENCY_UNAVAILABLE');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
  };
}
@Injectable()
export class QueueRuntime implements OnModuleDestroy {
  private queue?: Queue;
  private worker?: Worker;
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private readonly logger = new Logger('Worker');
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(OutboxDispatcher) private readonly dispatcher: OutboxDispatcher,
  ) {}
  async start() {
    if (this.queue) return;
    const url = this.config.get<string>('REDIS_URL');
    if (!url) throw new AppException('DEPENDENCY_UNAVAILABLE');
    const connection = redisConnection(url);
    this.queue = new Queue('handled-work', {
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
    });
    this.worker = new Worker(
      'handled-work',
      (job) => this.dispatcher.process(job.data),
      {
        connection,
        concurrency: this.config.get<number>('INVESTIGATION_CONCURRENCY', 2),
        maxStalledCount: 2,
      },
    );
    const onError = () =>
      this.logger.warn({
        event: 'queue.connection.failed',
        errorCode: 'DEPENDENCY_UNAVAILABLE',
      });
    this.queue.on('error', onError);
    this.worker.on('error', onError);
    await this.queue.waitUntilReady();
    await this.worker.waitUntilReady();
    this.stopped = false;
    void this.tick();
  }
  private async tick() {
    try {
      const counts = await this.queue!.getJobCounts(
        'active',
        'waiting',
        'delayed',
        'prioritized',
      );
      const inFlight = Object.values(counts).reduce(
        (total, count) => total + count,
        0,
      );
      const available = Math.max(
        0,
        this.config.get<number>('INVESTIGATION_CONCURRENCY', 2) - inFlight,
      );
      if (available > 0)
        await this.dispatcher.dispatch(
          async (data) => {
            await this.queue!.add('deliver', data, {
              jobId: `${data.outboxId}-${data.lockToken}`,
              attempts: 1,
              removeOnComplete: { count: 1000 },
              removeOnFail: { count: 1000 },
            });
          },
          Math.min(20, available),
        );
    } catch {
      this.logger.warn({
        event: 'outbox.dispatch.failed',
        errorCode: 'DEPENDENCY_UNAVAILABLE',
      });
    }
    if (!this.stopped) {
      this.timer = setTimeout(() => {
        void this.tick();
      }, 1000);
      this.timer.unref();
    }
  }
  async onModuleDestroy() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}
