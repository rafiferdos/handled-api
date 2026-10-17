import { randomUUID } from 'node:crypto';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { enqueueJob } from '../../src/modules/queue/job-contracts.js';
import {
  JobRegistry,
  OutboxDispatcher,
} from '../../src/modules/queue/outbox-dispatcher.js';
import { createActorFixture, createTestDatabase } from './helpers.js';

const db = createTestDatabase();
const uow = new UnitOfWork(db.prisma);
const workspaces: string[] = [];
afterEach(async () => {
  await db.prisma.outboxEvent.deleteMany({
    where: { workspaceId: { in: workspaces.splice(0) } },
  });
});
afterAll(() => db.close());

it('retains committed work when Redis fails and recovers an expired delivery lease', async () => {
  const actor = await createActorFixture(db.prisma);
  workspaces.push(actor.workspaceId);
  const intent = await uow.run((tx) =>
    enqueueJob(
      tx,
      actor.workspaceId,
      'investigation',
      randomUUID(),
      actor.requestId,
    ),
  );
  await db.prisma.outboxEvent.update({
    where: { id: intent.id },
    data: { availableAt: new Date(-172800000) },
  });
  const registry = new JobRegistry();
  const dispatcher = new OutboxDispatcher(uow, registry);
  await dispatcher.dispatch(async () => {
    throw new Error('Redis unavailable');
  });
  const pending = await db.prisma.outboxEvent.findUniqueOrThrow({
    where: { id: intent.id },
  });
  expect(pending.status).toBe('PENDING');
  expect(pending.lockToken).toBeNull();
  await db.prisma.outboxEvent.update({
    where: { id: intent.id },
    data: { availableAt: new Date(-172800000) },
  });
  const deliveries: unknown[] = [];
  await dispatcher.dispatch(async (data) => {
    deliveries.push(data);
  });
  expect(deliveries).toHaveLength(1);
  await db.prisma.outboxEvent.update({
    where: { id: intent.id },
    data: { lockedUntil: new Date(0) },
  });
  await dispatcher.dispatch(async (data) => {
    deliveries.push(data);
  });
  expect(deliveries).toHaveLength(2);
  expect(deliveries[0]).not.toEqual(deliveries[1]);
});

it('uses canonical tenant payloads and fences duplicate or obsolete workers', async () => {
  const actor = await createActorFixture(db.prisma);
  workspaces.push(actor.workspaceId);
  const id = randomUUID();
  const intent = await uow.run((tx) =>
    enqueueJob(tx, actor.workspaceId, 'action', id, actor.requestId),
  );
  await db.prisma.outboxEvent.update({
    where: { id: intent.id },
    data: { availableAt: new Date(-172800000) },
  });
  const registry = new JobRegistry();
  const dispatcher = new OutboxDispatcher(uow, registry);
  let effects = 0;
  registry.register('action', async (job) => {
    expect(job.aggregateId).toBe(id);
    await uow.run(async (tx) => {
      await job.assertCurrent(tx);
      effects++;
      await job.complete(tx);
    });
  });
  const data: unknown[] = [];
  await dispatcher.dispatch(async (payload) => {
    data.push(payload);
  });
  const delivery = data.find(
    (x) => (x as { outboxId: string }).outboxId === intent.id,
  ) as Record<string, unknown>;
  await expect(
    dispatcher.process({ ...delivery, workspaceId: randomUUID() }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await dispatcher.process({ ...delivery, lockToken: randomUUID() });
  expect(effects).toBe(0);
  await dispatcher.process(delivery);
  await dispatcher.process(delivery);
  expect(effects).toBe(1);
  expect(
    await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id: intent.id } }),
  ).toMatchObject({ status: 'PUBLISHED', lockToken: null });
});
