import { Global, Module, type DynamicModule } from '@nestjs/common';
import { BullModule, getQueueToken } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { QueueName } from '../../common/contracts/async.contracts.js';
import { ActionHandlerRegistry } from './action.handler.js';
import { ActionProcessor } from './processors/action.processor.js';
import { EvaluationProcessor } from './processors/evaluation.processor.js';
import {
  OutboxDispatcherService,
  OUTBOX_DISPATCHER_SERVICE_OPTIONS,
  type OutboxDispatcherServiceOptions,
} from './outbox-dispatcher.service.js';
import { QueueHealthIndicator } from './queue.health.js';
import { EventsModule } from '../events/events.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { EvaluationModule } from '../evaluation/evaluation.module.js';

export function shouldEnableBull(config: ConfigService): boolean {
  if (config.get<string>('QUEUE_DISABLED') === 'true') return false;
  const url = config.get<string>('REDIS_URL')?.trim() ?? '';
  return url.length > 0;
}

/**
 * Stub BullMQ Queue. Used when REDIS_URL is empty or `QUEUE_DISABLED=true`
 * (test env, local dev without a broker). Lets `ActionService` keep a typed
 * `@InjectQueue(QueueName.ACTION)` parameter while the no-Redis branch
 * never connects to a broker. `add()` is intentionally a throw — the
 * service's caller is expected to either set a real broker or override the
 * queue token with a controlled stub before reaching that path.
 */
const NOOP_QUEUE: Pick<Queue, 'add'> = {
  add: async () => {
    throw new Error(
      'Queue is disabled (no REDIS_URL). Set QUEUE_DISABLED=false and provide a real broker before admitting actions.',
    );
  },
};

/**
 * Person D owns the queue + worker lifecycle.
 *
 * Production: BullMQ root + the `action` + `evaluation` queues + both
 * workers are wired. When `REDIS_URL` is empty or `QUEUE_DISABLED=true`
 * (the e2e suite, local dev without a broker) the Bull root is NOT
 * registered, the workers are NOT registered, and stub queue tokens are
 * provided so the services that depend on `@InjectQueue(...)` can still
 * be constructed. Admission tests override the queue tokens with
 * controlled stubs before invoking the services.
 *
 * The OutboxDispatcherService (durable outbox recovery) is always active
 * because it operates on the database outbox and is decoupled from Redis.
 * The service still receives a stub queue token in the no-bull branch so
 * the `add()` call will fail deterministically and the row gets retried
 * on the next tick.
 */
@Global()
@Module({})
export class QueueModule {
  static forRoot(config: ConfigService): DynamicModule {
    if (!shouldEnableBull(config)) {
      return {
        module: QueueModule,
        global: true,
        imports: [ConfigModule, AuditModule, EventsModule, EvaluationModule],
        providers: [
          ActionHandlerRegistry,
          // Register the BullMQ processors as plain providers in the
          // no-bull branch so e2e specs can resolve them from the DI
          // container. Without a real broker the @Processor decorator's
          // metadata is harmless (the explorer that turns it into a
          // worker is part of the bull-only `BullModule.forRoot` setup).
          // Tests drive `process()` directly; production never reaches
          // this branch.
          ActionProcessor,
          EvaluationProcessor,
          OutboxDispatcherService,
          QueueHealthIndicator,
          // Default options for the dispatcher service so the constructor
          // resolves with no extra wiring. Tests that need different
          // timers or instance ids override this token at registration.
          {
            provide: OUTBOX_DISPATCHER_SERVICE_OPTIONS,
            useValue: {} satisfies OutboxDispatcherServiceOptions,
          },
          // Stub the queue tokens so the services that depend on
          // @InjectQueue(...) can still be constructed. The stub's `add()`
          // throws so any code path that actually publishes will surface a
          // clear, deterministic error.
          {
            provide: getQueueToken(QueueName.ACTION),
            useValue: NOOP_QUEUE,
          },
          {
            provide: getQueueToken(QueueName.EVALUATION),
            useValue: NOOP_QUEUE,
          },
        ],
        exports: [
          OutboxDispatcherService,
          QueueHealthIndicator,
          getQueueToken(QueueName.ACTION),
          getQueueToken(QueueName.EVALUATION),
        ],
      };
    }
    return {
      module: QueueModule,
      global: true,
      imports: [
        ConfigModule,
        AuditModule,
        EventsModule,
        EvaluationModule,
        BullModule.forRootAsync({
          inject: [ConfigService],
          useFactory: (cfg: ConfigService) => ({
            connection: { url: cfg.getOrThrow<string>('REDIS_URL').trim() },
          }),
        }),
        BullModule.registerQueue({ name: QueueName.ACTION }),
        BullModule.registerQueue({ name: QueueName.EVALUATION }),
      ],
      providers: [
        ActionHandlerRegistry,
        ActionProcessor,
        EvaluationProcessor,
        OutboxDispatcherService,
        QueueHealthIndicator,
        {
          provide: OUTBOX_DISPATCHER_SERVICE_OPTIONS,
          useValue: {} satisfies OutboxDispatcherServiceOptions,
        },
      ],
      exports: [OutboxDispatcherService, QueueHealthIndicator],
    };
  }
}
