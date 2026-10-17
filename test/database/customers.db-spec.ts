import { createActorFixture, createTestDatabase } from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { CustomerService } from '../../src/modules/customer/customer.service.js';
import { BillingReadService } from '../../src/modules/billing/billing-read.service.js';
const db = createTestDatabase();
const uow = new UnitOfWork(db.prisma);
const customers = new CustomerService(uow);
const billing = new BillingReadService(uow);
afterAll(() => db.close());
it('scopes customer items, counts and account context to the active workspace', async () => {
  const a = await createActorFixture(db.prisma),
    b = await createActorFixture(db.prisma);
  const customer = await customers.create(a, {
    externalRef: 'CUS-1',
    name: 'Maya',
    email: 'maya@example.invalid',
  });
  expect(customer).not.toHaveProperty('workspaceId');
  expect((await customers.list(a, { page: 1, limit: 20 })).meta.total).toBe(1);
  expect((await customers.list(b, { page: 1, limit: 20 })).meta.total).toBe(0);
  await expect(customers.detail(b, customer.id)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
  await expect(billing.context(b, customer.id)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
  const subscription = await db.prisma.subscription.create({
    data: {
      workspaceId: a.workspaceId,
      customerId: customer.id,
      externalRef: 'SUB-1',
      planCode: 'PRO',
      productCode: 'app',
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 86400000),
    },
  });
  await db.prisma.payment.create({
    data: {
      workspaceId: a.workspaceId,
      customerId: customer.id,
      subscriptionId: subscription.id,
      externalRef: 'PAY-1',
      billingPeriodKey: '2026-10',
      amountMinor: 2900,
      currency: 'USD',
      status: 'SETTLED',
      paidAt: new Date(),
    },
  });
  const context = await billing.context(a, customer.id);
  expect(context.payments[0]).toMatchObject({
    amountMinor: 2900,
    currency: 'USD',
  });
  expect(context.subscriptions[0]).toMatchObject({
    id: subscription.id,
    productCode: 'app',
  });
  expect(JSON.stringify(context)).not.toContain('workspaceId');
  await customers.update(a, customer.id, {
    expectedVersion: 1,
    status: 'BLOCKED',
  });
  await expect(billing.context(a, customer.id)).rejects.toMatchObject({
    code: 'BUSINESS_RULE_FAILED',
  });
  expect(await customers.detail(a, customer.id)).toMatchObject({
    status: 'BLOCKED',
    version: 2,
  });
  await expect(
    customers.update(a, customer.id, { expectedVersion: 1, name: 'stale' }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
});
