import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';

/**
 * Read-only Redis check for `/ready`. We do NOT mutate Redis here; the only
 * side effect is a `PING`. Returns true when the connection is ready AND a
 * PING round-trip succeeds within the 1 s socket timeout.
 *
 * REDIS_URL is optional (Person D owns Redis). When it is empty we report
 * "unconfigured" and `/ready` stays 200 — local development without a
 * queue must not block the rest of the API.
 */
@Injectable()
export class QueueHealthIndicator implements OnModuleInit {
  private readonly logger = new Logger(QueueHealthIndicator.name);
  private readonly url: string;
  private probe?: Redis;

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    this.url = this.config.get<string>('REDIS_URL')?.trim() ?? '';
  }

  onModuleInit(): void {
    if (!this.url) return;
    // LazyConnect: avoid boot-time failures when Redis is down. The probe
    // reconnects on demand so a transient outage does not permanently fail
    // `/ready`.
    this.probe = new Redis(this.url, {
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: true,
      connectTimeout: 1_000,
      retryStrategy: () => null,
    });
    this.probe.on('error', (err: unknown) => {
      // The error may carry a credential; do not log it raw.
      this.logger.warn(
        `Redis health probe encountered an error: ${err instanceof Error ? err.constructor.name : typeof err}`,
      );
    });
  }

  async ready(): Promise<{ redis: 'connected' | 'unconfigured' }> {
    if (!this.url) return { redis: 'unconfigured' };
    const probe = this.probe;
    if (!probe) {
      throw new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE, null);
    }
    try {
      if (probe.status !== 'ready') await probe.connect();
      const reply = await Promise.race([
        probe.ping(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('ping-timeout')), 1_000),
        ),
      ]);
      if (reply !== 'PONG') {
        throw new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE, null);
      }
      return { redis: 'connected' };
    } catch {
      throw new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE, null);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    const probe = this.probe;
    if (!probe) return;
    await probe.quit().catch(() => undefined);
    this.probe = undefined;
  }
}
