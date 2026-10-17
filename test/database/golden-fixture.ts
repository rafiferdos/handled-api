import { randomUUID } from 'node:crypto';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { InvestigationRepository } from '../../src/modules/investigation/investigation.repository.js';
import { ProposalRepository } from '../../src/modules/proposal/proposal.repository.js';
import { InvestigationService } from '../../src/modules/investigation/investigation.service.js';
import { InvestigationProcessor } from '../../src/modules/investigation/investigation-processor.js';
import { KnowledgeService } from '../../src/modules/knowledge/knowledge.service.js';
import { KnowledgeIndexer } from '../../src/modules/knowledge/knowledge-indexer.js';
import { ReadTools } from '../../src/modules/ai/read-tools.js';
import { BillingReadService } from '../../src/modules/billing/billing-read.service.js';
import {
  JobRegistry,
  OutboxDispatcher,
} from '../../src/modules/queue/outbox-dispatcher.js';
import { FixtureProvider } from './provider.js';
import { createActorFixture } from './helpers.js';
import {
  classificationSchema,
  proposalOutputSchema,
} from '../../src/modules/ai/contracts/proposal-output.schema.js';
export async function deliverJob(
  prisma: PrismaClient,
  dispatcher: OutboxDispatcher,
  workspaceId: string,
  type: string,
) {
  const row = await prisma.outboxEvent.findFirstOrThrow({
      where: { workspaceId, type, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    }),
    lockToken = randomUUID();
  await prisma.outboxEvent.update({
    where: { id: row.id },
    data: { lockToken, lockedUntil: new Date(Date.now() + 60000) },
  });
  const delivery = { workspaceId, outboxId: row.id, lockToken };
  await dispatcher.process(delivery);
  return delivery;
}
export async function goldenFixture(
  prisma: PrismaClient,
  kind: 'refund' | 'cancel' | 'restore' = 'refund',
) {
  const uow = new UnitOfWork(prisma),
    provider = new FixtureProvider(),
    registry = new JobRegistry(),
    dispatcher = new OutboxDispatcher(uow, registry),
    actor = await createActorFixture(prisma);
  const runs = new InvestigationRepository(uow),
    proposals = new ProposalRepository(uow),
    knowledge = new KnowledgeService(uow, provider),
    billing = new BillingReadService(uow),
    tools = new ReadTools(uow, billing, knowledge),
    investigations = new InvestigationService(uow, runs, proposals, provider);
  new KnowledgeIndexer(uow, provider, registry).onModuleInit();
  new InvestigationProcessor(
    uow,
    runs,
    proposals,
    provider,
    tools,
    registry,
  ).onModuleInit();
  const member = await prisma.membership.findUniqueOrThrow({
    where: {
      workspaceId_userId: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
      },
    },
  });
  const customer = await prisma.customer.create({
    data: {
      workspaceId: actor.workspaceId,
      externalRef: 'CUS-1',
      name: 'Maya',
      email: 'maya@example.invalid',
    },
  });
  const subscription = await prisma.subscription.create({
    data: {
      workspaceId: actor.workspaceId,
      customerId: customer.id,
      externalRef: 'SUB-1',
      planCode: 'PRO',
      productCode: 'APP',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 86400000),
    },
  });
  const payment = await prisma.payment.create({
    data: {
      workspaceId: actor.workspaceId,
      customerId: customer.id,
      subscriptionId: subscription.id,
      externalRef: 'PAY-1',
      billingPeriodKey: 'current-period',
      status: 'SETTLED',
      amountMinor: 2900,
      currency: 'USD',
      paidAt: new Date(),
    },
  });
  const duplicate = await prisma.payment.create({
    data: {
      workspaceId: actor.workspaceId,
      customerId: customer.id,
      subscriptionId: subscription.id,
      externalRef: 'PAY-2',
      billingPeriodKey: 'current-period',
      status: 'SETTLED',
      amountMinor: 2900,
      currency: 'USD',
      paidAt: new Date(),
    },
  });
  const access = await prisma.productAccess.create({
    data: {
      workspaceId: actor.workspaceId,
      customerId: customer.id,
      productCode: 'APP',
      status: 'REVOKED',
      reason: 'SYNC_ERROR',
    },
  });
  const ticket = await prisma.ticket.create({
    data: {
      workspaceId: actor.workspaceId,
      reference: 'TKT-1',
      subject: `Please ${kind}`,
      customerId: customer.id,
      customerVerifiedAt: new Date(),
      customerVerifiedById: member.id,
    },
  });
  await prisma.ticketMessage.create({
    data: {
      workspaceId: actor.workspaceId,
      ticketId: ticket.id,
      authorType: 'CUSTOMER',
      body: `Please investigate my ${kind} issue`,
    },
  });
  const type =
    kind === 'refund'
      ? 'REFUND_DUPLICATE_PAYMENT'
      : kind === 'cancel'
        ? 'CANCEL_AT_PERIOD_END'
        : 'RESTORE_PRODUCT_ACCESS';
  const document = await knowledge.create(actor, {
    slug: 'policy',
    title: 'Approved policy',
    body: 'An eligible human-approved correction is permitted after verified account checks.',
    policyRules: { allowedActions: [type] },
  });
  await knowledge.publish(actor, document.id, { expectedVersion: 1 });
  await deliverJob(
    prisma,
    dispatcher,
    actor.workspaceId,
    'job.knowledge-index',
  );
  const context = {
    actor,
    workspaceId: actor.workspaceId,
    requestId: actor.requestId,
    ticketId: ticket.id,
    customerId: customer.id,
  };
  const callBatch = [
    { name: 'getCustomerProfile', arguments: { customerId: customer.id } },
    { name: 'listCustomerPayments', arguments: { customerId: customer.id } },
    { name: 'getActiveSubscription', arguments: { customerId: customer.id } },
    { name: 'getProductAccess', arguments: { customerId: customer.id } },
  ] as const;
  const evidence = (
    await Promise.all(callBatch.map((call) => tools.execute(context, call)))
  ).flatMap((r) => r.sources);
  const policy = await knowledge.search(
    actor.workspaceId,
    'policy',
    5,
    new AbortController().signal,
  );
  evidence.push(...policy);
  provider.classification = classificationSchema.parse({
    category:
      kind === 'refund'
        ? 'BILLING_DUPLICATE_CHARGE'
        : kind === 'cancel'
          ? 'SUBSCRIPTION_CANCELLATION'
          : 'PRODUCT_ACCESS_ISSUE',
    priority: 'HIGH',
    confidence: 'HIGH',
    missingFacts: [],
  });
  provider.toolBatches = [
    callBatch,
    [{ name: 'searchKnowledge', arguments: { query: 'policy', topK: 5 } }],
    [],
  ];
  provider.output = proposalOutputSchema.parse({
    category: provider.classification.category,
    summary: `Proposed ${kind} from verified evidence`,
    confidence: 'HIGH',
    missingFacts: [],
    recommendation: {
      type,
      targetRef:
        kind === 'refund' ? 'PAY-2' : kind === 'cancel' ? 'SUB-1' : access.id,
      params: kind === 'refund' ? { amountMinor: 2900, currency: 'USD' } : {},
    },
    replyDraft: 'Proposed correction for review',
    evidenceRefs: evidence.map((s) => s.sourceRefId),
  });
  const admitted = await investigations.start(actor, ticket.id);
  await deliverJob(prisma, dispatcher, actor.workspaceId, 'job.investigation');
  const proposal = await investigations.latestProposal(
    actor,
    admitted.investigationId,
  );
  if (!proposal) throw new Error('Golden fixture did not produce a proposal');
  return {
    uow,
    provider,
    registry,
    dispatcher,
    actor,
    customer,
    subscription,
    payment,
    duplicate,
    access,
    ticket,
    document,
    proposal,
    proposals,
    investigations,
    knowledge,
    runId: admitted.investigationId,
  };
}
