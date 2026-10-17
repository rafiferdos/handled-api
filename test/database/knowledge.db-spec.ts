import { randomUUID } from 'node:crypto';
import { createActorFixture, createTestDatabase } from './helpers.js';
import { FixtureProvider } from './provider.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { KnowledgeService } from '../../src/modules/knowledge/knowledge.service.js';
import { KnowledgeIndexer } from '../../src/modules/knowledge/knowledge-indexer.js';
import {
  JobRegistry,
  OutboxDispatcher,
} from '../../src/modules/queue/outbox-dispatcher.js';
const db = createTestDatabase(),
  uow = new UnitOfWork(db.prisma),
  provider = new FixtureProvider(),
  knowledge = new KnowledgeService(uow, provider);
const registry = new JobRegistry(),
  dispatcher = new OutboxDispatcher(uow, registry);
new KnowledgeIndexer(uow, provider, registry).onModuleInit();
afterAll(() => db.close());
async function index(workspaceId: string) {
  const row = await db.prisma.outboxEvent.findFirstOrThrow({
    where: { workspaceId, type: 'job.knowledge-index', status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
  });
  const lockToken = randomUUID();
  await db.prisma.outboxEvent.update({
    where: { id: row.id },
    data: { lockToken, lockedUntil: new Date(Date.now() + 60000) },
  });
  await dispatcher.process({ outboxId: row.id, workspaceId, lockToken });
}
it('retrieves only current indexed published policy and retains cited history after archive', async () => {
  const actor = await createActorFixture(db.prisma),
    foreign = await createActorFixture(db.prisma);
  const draft = await knowledge.create(actor, {
    slug: 'refund-policy',
    title: 'Refund',
    body: 'Refund only the matching duplicate settled charge.',
    policyRules: { allowedActions: ['REFUND_DUPLICATE_PAYMENT'] },
  });
  expect(
    await knowledge.search(
      actor.workspaceId,
      'refund',
      5,
      new AbortController().signal,
    ),
  ).toEqual([]);
  await knowledge.publish(actor, draft.id, { expectedVersion: 1 });
  expect(
    await knowledge.search(
      actor.workspaceId,
      'refund',
      5,
      new AbortController().signal,
    ),
  ).toEqual([]);
  await index(actor.workspaceId);
  const sources = await knowledge.search(
    actor.workspaceId,
    'refund',
    5,
    new AbortController().signal,
  );
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatchObject({
    sourceType: 'KNOWLEDGE',
    documentId: draft.id,
    documentVersion: 1,
  });
  expect(
    await knowledge.search(
      foreign.workspaceId,
      'refund',
      5,
      new AbortController().signal,
    ),
  ).toEqual([]);
  await knowledge.archive(actor, draft.id, { expectedVersion: 1 });
  expect(
    await knowledge.search(
      actor.workspaceId,
      'refund',
      5,
      new AbortController().signal,
    ),
  ).toEqual([]);
  expect(
    await db.prisma.knowledgeChunk.count({ where: { documentId: draft.id } }),
  ).toBe(1);
});
it('does not expose stale embeddings when a policy is archived during indexing', async () => {
  const actor = await createActorFixture(db.prisma);
  const draft = await knowledge.create(actor, {
    slug: 'cancel-policy',
    title: 'Cancel',
    body: 'Cancellation preserves paid access until period end.',
    policyRules: { allowedActions: ['CANCEL_AT_PERIOD_END'] },
  });
  await knowledge.publish(actor, draft.id, { expectedVersion: 1 });
  provider.beforeEmbed = async () => {
    provider.beforeEmbed = undefined;
    await knowledge.archive(actor, draft.id, { expectedVersion: 1 });
  };
  await index(actor.workspaceId);
  expect(
    await knowledge.search(
      actor.workspaceId,
      'cancel',
      5,
      new AbortController().signal,
    ),
  ).toEqual([]);
  expect(
    await db.prisma.knowledgeChunk.count({ where: { documentId: draft.id } }),
  ).toBe(0);
});
