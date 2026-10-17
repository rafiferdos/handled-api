import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { createActorFixture, createTestDatabase } from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import {
  JobRegistry,
  OutboxDispatcher,
} from '../../src/modules/queue/outbox-dispatcher.js';
import { QueueRuntime } from '../../src/modules/queue/queue-runtime.js';
import { enqueueJob } from '../../src/modules/queue/job-contracts.js';
const url = process.env.TEST_REDIS_URL;
describe.skipIf(!url)('actual Redis/BullMQ recovery', () => {
  const parsed = url ? new URL(url) : undefined;
  if (
    parsed &&
    (parsed.hostname !== '127.0.0.1' ||
      !parsed.port ||
      parsed.pathname !== '/15' ||
      parsed.search ||
      parsed.hash)
  )
    throw new Error(
      'Disposable Redis must be explicit 127.0.0.1 port and DB 15',
    );
  const db = createTestDatabase(),
    uow = new UnitOfWork(db.prisma);
  afterAll(() => db.close());
  it('keeps an intent after real connection refusal and completes it once after worker restart', async () => {
    const actor = await createActorFixture(db.prisma),
      registry = new JobRegistry(),
      dispatcher = new OutboxDispatcher(uow, registry);
    registry.register('action', async (job) => {
      if (job.workspaceId !== actor.workspaceId)
        throw new Error('Different fixture scope');
      await uow.run(async (tx) => {
        await job.assertCurrent(tx);
        await tx.auditEvent.create({
          data: {
            workspaceId: job.workspaceId,
            entityType: 'fixture',
            entityId: job.aggregateId,
            eventType: 'fixture.worker_effect',
            actorType: 'SYSTEM',
            requestId: job.requestId,
          },
        });
        await job.complete(tx);
      });
    });
    const config = new ConfigService({
      REDIS_URL: url,
      INVESTIGATION_CONCURRENCY: 2,
    });
    const first = new QueueRuntime(config, dispatcher);
    await first.start();
    await first.onModuleDestroy();
    const intent = await uow.run((tx) =>
      enqueueJob(
        tx,
        actor.workspaceId,
        'action',
        randomUUID(),
        actor.requestId,
      ),
    );
    const refused = new Queue('handled-refused-test', {
      connection: {
        host: '127.0.0.1',
        port: 56380,
        connectTimeout: 100,
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      },
    });
    refused.on('error', () => {});
    await dispatcher.dispatch(async (data) => {
      await refused.add('deliver', data);
    });
    await refused.close();
    expect(
      (
        await db.prisma.outboxEvent.findUniqueOrThrow({
          where: { id: intent.id },
        })
      ).status,
    ).toBe('PENDING');
    await db.prisma.outboxEvent.update({
      where: { id: intent.id },
      data: { availableAt: new Date(0) },
    });
    const second = new QueueRuntime(config, dispatcher);
    await second.start();
    try {
      let done = false;
      for (let n = 0; n < 100; n++) {
        if (
          (
            await db.prisma.outboxEvent.findUniqueOrThrow({
              where: { id: intent.id },
            })
          ).status === 'PUBLISHED'
        ) {
          done = true;
          break;
        }
        await setTimeout(50);
      }
      expect(done).toBe(true);
      expect(
        await db.prisma.auditEvent.count({
          where: {
            workspaceId: actor.workspaceId,
            eventType: 'fixture.worker_effect',
          },
        }),
      ).toBe(1);
    } finally {
      await second.onModuleDestroy();
    }
  });
});
