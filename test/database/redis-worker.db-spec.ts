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
  const workspaces: string[] = [];
  afterEach(async () => {
    await db.prisma.outboxEvent.deleteMany({
      where: { workspaceId: { in: workspaces.splice(0) } },
    });
  });
  afterAll(() => db.close());
  it('keeps an intent after real connection refusal and completes it once after worker restart', async () => {
    const actor = await createActorFixture(db.prisma),
      registry = new JobRegistry(),
      dispatcher = new OutboxDispatcher(uow, registry);
    workspaces.push(actor.workspaceId);
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
      data: { availableAt: new Date(-172800000) },
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
  it('does not spend delivery attempts on healthy work waiting behind a full worker', async () => {
    const actor = await createActorFixture(db.prisma),
      registry = new JobRegistry(),
      dispatcher = new OutboxDispatcher(uow, registry);
    workspaces.push(actor.workspaceId);
    let release!: () => void, entered!: () => void;
    const gate = new Promise<void>((resolve) => {
        release = resolve;
      }),
      started = new Promise<void>((resolve) => {
        entered = resolve;
      });
    registry.register('action', async (job) => {
      if (job.workspaceId !== actor.workspaceId)
        throw new Error('Different fixture scope');
      entered();
      await gate;
      await uow.run(async (tx) => {
        await job.complete(tx);
      });
    });
    for (let i = 0; i < 8; i++) {
      const row = await uow.run((tx) =>
        enqueueJob(
          tx,
          actor.workspaceId,
          'action',
          randomUUID(),
          actor.requestId,
        ),
      );
      await db.prisma.outboxEvent.update({
        where: { id: row.id },
        data: { availableAt: new Date(-172800000) },
      });
    }
    const runtime = new QueueRuntime(
      new ConfigService({ REDIS_URL: url, INVESTIGATION_CONCURRENCY: 1 }),
      dispatcher,
    );
    await runtime.start();
    try {
      await Promise.race([
        started,
        setTimeout(5000).then(() => {
          throw new Error('Worker did not start');
        }),
      ]);
      // Simulate queue residence beyond the DB delivery lease for non-running work.
      const current = await db.prisma.outboxEvent.findMany({
        where: { workspaceId: actor.workspaceId },
        orderBy: { updatedAt: 'asc' },
      });
      for (const row of current.slice(0, -1))
        if (row.lockToken)
          await db.prisma.outboxEvent.update({
            where: { id: row.id },
            data: { lockedUntil: new Date(0) },
          });
      await setTimeout(1200);
      const rows = await db.prisma.outboxEvent.findMany({
        where: { workspaceId: actor.workspaceId },
      });
      expect(rows.filter((row) => row.attempts > 0)).toHaveLength(1);
      expect(rows.filter((row) => row.status === 'FAILED')).toHaveLength(0);
    } finally {
      release();
      await runtime.onModuleDestroy();
    }
  });
});
