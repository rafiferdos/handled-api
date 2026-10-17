import { randomUUID } from 'node:crypto';
import { createActorFixture, createTestDatabase } from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { BillingReadService } from '../../src/modules/billing/billing-read.service.js';
import { KnowledgeService } from '../../src/modules/knowledge/knowledge.service.js';
import { FixtureProvider } from './provider.js';
import { ReadTools } from '../../src/modules/ai/read-tools.js';
const db = createTestDatabase(),
  uow = new UnitOfWork(db.prisma),
  tools = new ReadTools(
    uow,
    new BillingReadService(uow),
    new KnowledgeService(uow, new FixtureProvider()),
  );
afterAll(() => db.close());
it('prevents model customer IDs or unsupported tool names expanding ticket scope', async () => {
  const actor = await createActorFixture(db.prisma);
  const member = await db.prisma.membership.findUniqueOrThrow({
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
      reference: 'TKT-1',
      subject: 'Issue',
      customerId: customer.id,
      customerVerifiedAt: new Date(),
      customerVerifiedById: member.id,
    },
  });
  const context = {
    actor,
    workspaceId: actor.workspaceId,
    ticketId: ticket.id,
    customerId: customer.id,
    requestId: actor.requestId,
  };
  const result = await tools.execute(context, {
    name: 'getCustomerProfile',
    arguments: { customerId: customer.id },
  });
  expect(result.data).toMatchObject({ id: customer.id, externalRef: 'CUS-1' });
  expect(result.sources).toHaveLength(1);
  await db.prisma.subscription.createMany({
    data: Array.from({ length: 51 }, (_, i) => ({
      workspaceId: actor.workspaceId,
      customerId: customer.id,
      externalRef: `SUB-${i}`,
      planCode: 'PRO',
      productCode: 'APP',
      currentPeriodStart: new Date(Date.now() - 86400000),
      currentPeriodEnd: new Date(Date.now() + 86400000),
    })),
  });
  const ambiguous = await tools.execute(context, {
    name: 'getActiveSubscription',
    arguments: { customerId: customer.id },
  });
  expect(ambiguous.data).toBeNull();
  expect(ambiguous.missingFacts).toEqual(
    expect.arrayContaining([
      'Subscription history exceeds the bounded tool result',
      'Conflicting active subscriptions require manual review',
    ]),
  );
  await expect(
    tools.execute(context, {
      name: 'getCustomerProfile',
      arguments: { customerId: randomUUID() },
    }),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await expect(
    tools.execute(context, { name: 'refundPayment', arguments: {} }),
  ).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
  const foreign = await createActorFixture(db.prisma);
  await expect(
    tools.execute(
      { ...context, actor: foreign, workspaceId: foreign.workspaceId },
      { name: 'getCustomerProfile', arguments: { customerId: customer.id } },
    ),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await db.prisma.customer.update({
    where: { id: customer.id },
    data: { status: 'BLOCKED' },
  });
  await expect(
    tools.execute(context, {
      name: 'listCustomerPayments',
      arguments: { customerId: customer.id },
    }),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_FAILED' });
});
