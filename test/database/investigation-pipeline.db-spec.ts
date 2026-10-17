import { randomUUID } from 'node:crypto';
import { createActorFixture, createTestDatabase } from './helpers.js';
import { FixtureProvider } from './provider.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { InvestigationRepository } from '../../src/modules/investigation/investigation.repository.js';
import { ProposalRepository } from '../../src/modules/proposal/proposal.repository.js';
import { InvestigationService } from '../../src/modules/investigation/investigation.service.js';
import { InvestigationProcessor } from '../../src/modules/investigation/investigation-processor.js';
import { ReadTools } from '../../src/modules/ai/read-tools.js';
import { KnowledgeService } from '../../src/modules/knowledge/knowledge.service.js';
import { BillingReadService } from '../../src/modules/billing/billing-read.service.js';
import {
  JobRegistry,
  OutboxDispatcher,
} from '../../src/modules/queue/outbox-dispatcher.js';
const db = createTestDatabase(),
  uow = new UnitOfWork(db.prisma),
  provider = new FixtureProvider(),
  registry = new JobRegistry(),
  dispatcher = new OutboxDispatcher(uow, registry),
  runs = new InvestigationRepository(uow),
  proposals = new ProposalRepository(uow);
const service = new InvestigationService(uow, runs, proposals, provider);
new InvestigationProcessor(
  uow,
  runs,
  proposals,
  provider,
  new ReadTools(
    uow,
    new BillingReadService(uow),
    new KnowledgeService(uow, provider),
  ),
  registry,
).onModuleInit();
afterAll(() => db.close());
async function fixture() {
  const actor = await createActorFixture(db.prisma),
    member = await db.prisma.membership.findUniqueOrThrow({
      where: {
        workspaceId_userId: {
          workspaceId: actor.workspaceId,
          userId: actor.userId,
        },
      },
    });
  const customer = await db.prisma.customer.create({
    data: {
      workspaceId: actor.workspaceId,
      externalRef: 'CUS-1',
      name: 'Maya',
      email: 'maya@example.invalid',
    },
  });
  const ticket = await db.prisma.ticket.create({
    data: {
      workspaceId: actor.workspaceId,
      customerId: customer.id,
      customerVerifiedAt: new Date(),
      customerVerifiedById: member.id,
      reference: 'TKT-1',
      subject: 'Unknown question',
    },
  });
  await db.prisma.ticketMessage.create({
    data: {
      workspaceId: actor.workspaceId,
      ticketId: ticket.id,
      authorType: 'CUSTOMER',
      body: 'Please help',
    },
  });
  return { actor, ticket };
}
async function deliver(workspaceId: string) {
  const row = await db.prisma.outboxEvent.findFirstOrThrow({
      where: { workspaceId, type: 'job.investigation', status: 'PENDING' },
    }),
    lockToken = randomUUID();
  await db.prisma.outboxEvent.update({
    where: { id: row.id },
    data: { lockToken, lockedUntil: new Date(Date.now() + 60000) },
  });
  const data = { workspaceId, outboxId: row.id, lockToken };
  await dispatcher.process(data);
  await dispatcher.process(data);
}
it('coalesces concurrent admission and records a safe manual-review proposal once', async () => {
  const f = await fixture();
  provider.output = {
    category: 'OTHER',
    summary: 'Human review required',
    confidence: provider.classification.confidence,
    missingFacts: ['No policy'],
    recommendation: null,
    replyDraft: 'An agent will review this.',
    evidenceRefs: [],
  };
  const [first, second] = await Promise.all([
    service.start(f.actor, f.ticket.id),
    service.start(f.actor, f.ticket.id),
  ]);
  expect(first.investigationId).toBe(second.investigationId);
  expect(
    await db.prisma.outboxEvent.count({
      where: { workspaceId: f.actor.workspaceId, type: 'job.investigation' },
    }),
  ).toBe(1);
  await deliver(f.actor.workspaceId);
  expect(await runs.read(f.actor, first.investigationId)).toMatchObject({
    status: 'NEEDS_REVIEW',
  });
  expect(
    (
      await db.prisma.investigationRun.findUniqueOrThrow({
        where: { id: first.investigationId },
      })
    ).usage,
  ).toMatchObject({ calls: 4, inputTokens: 40, outputTokens: 40 });
  expect(
    await db.prisma.proposal.count({
      where: { workspaceId: f.actor.workspaceId },
    }),
  ).toBe(1);
  expect(
    await db.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } }),
  ).toMatchObject({ status: 'NEEDS_REVIEW' });
});
it('persists safe provider failure without an apparently successful proposal', async () => {
  const f = await fixture();
  provider.output = undefined;
  const queued = await service.start(f.actor, f.ticket.id);
  await deliver(f.actor.workspaceId);
  expect(await runs.read(f.actor, queued.investigationId)).toMatchObject({
    status: 'FAILED',
    failureCode: 'AI_PROVIDER_ERROR',
  });
  expect(
    await db.prisma.proposal.count({
      where: { workspaceId: f.actor.workspaceId },
    }),
  ).toBe(0);
});
it('rechecks identity after provider work and never publishes after session revocation', async () => {
  const f = await fixture();
  provider.output = {
    category: 'OTHER',
    summary: 'Human review required',
    confidence: provider.classification.confidence,
    missingFacts: ['No policy'],
    recommendation: null,
    replyDraft: 'An agent will review this.',
    evidenceRefs: [],
  };
  provider.beforeReply = async () => {
    provider.beforeReply = undefined;
    await db.prisma
      .$executeRaw`DELETE FROM auth.sessions WHERE id=${f.actor.sessionId}::uuid`;
  };
  const queued = await service.start(f.actor, f.ticket.id);
  await deliver(f.actor.workspaceId);
  expect(
    await db.prisma.investigationRun.findUniqueOrThrow({
      where: { id: queued.investigationId },
    }),
  ).toMatchObject({ status: 'FAILED', failureCode: 'UNAUTHENTICATED' });
  expect(
    await db.prisma.proposal.count({
      where: { workspaceId: f.actor.workspaceId },
    }),
  ).toBe(0);
});
