import { randomUUID } from 'node:crypto';
import {
  createActorFixture,
  createAuthFixture,
  createTestDatabase,
} from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { IdempotencyService } from '../../src/common/database/idempotency.service.js';
import { CustomerService } from '../../src/modules/customer/customer.service.js';
import { TicketStateService } from '../../src/modules/ticket/ticket-state.service.js';
import { TicketService } from '../../src/modules/ticket/ticket.service.js';
const db = createTestDatabase();
const uow = new UnitOfWork(db.prisma);
const tickets = new TicketService(
  uow,
  new IdempotencyService(uow),
  new TicketStateService(),
);
const customers = new CustomerService(uow);
afterAll(() => db.close());
it('allows a failed execution to return to human review without fabricating a successful state', async () => {
  const actor = await createActorFixture(db.prisma);
  const ticket = await db.prisma.ticket.create({
    data: {
      workspaceId: actor.workspaceId,
      reference: 'TKT-FAILED',
      subject: 'Failed action',
      status: 'EXECUTION_FAILED',
    },
  });
  expect(
    await tickets.manualStatus(actor, ticket.id, {
      expectedVersion: 1,
      status: 'NEEDS_REVIEW',
    }),
  ).toMatchObject({ status: 'NEEDS_REVIEW', version: 2 });
  await expect(
    tickets.manualStatus(actor, ticket.id, {
      expectedVersion: 2,
      status: 'RESOLVED',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
});
it('creates ticket/message atomically with per-workspace references and durable retry', async () => {
  const a = await createActorFixture(db.prisma),
    b = await createActorFixture(db.prisma);
  const payload = {
    subject: 'Payment duplicated',
    body: 'Please review both charges.',
  };
  const first = await tickets.create(a, 'ticket-create-1', payload);
  const again = await tickets.create(a, 'ticket-create-1', payload);
  expect(first.id).toBe(again.id);
  expect(first.reference).toBe('TKT-1001');
  expect((await tickets.create(b, 'ticket-create-1', payload)).reference).toBe(
    'TKT-1001',
  );
  expect(
    (await tickets.messages(a, first.id, { page: 1, limit: 20 })).data,
  ).toMatchObject([
    { body: payload.body, visibility: 'PUBLIC', authorType: 'AGENT' },
  ]);
  expect(
    (await tickets.list(a, { page: 1, limit: 20, status: 'NEW' })).meta.total,
  ).toBe(1);
  await expect(tickets.detail(b, first.id)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
  await expect(
    tickets.create(a, 'ticket-create-1', { ...payload, subject: 'Different' }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
});
it('guards customer verification, current assignees, versions and manual states', async () => {
  const a = await createActorFixture(db.prisma),
    b = await createActorFixture(db.prisma);
  const t = await tickets.create(a, randomUUID(), {
    subject: 'Access issue',
    body: 'Restore access',
  });
  const c = await customers.create(a, {
    externalRef: 'CUS-1',
    name: 'Maya',
    email: 'maya@example.invalid',
  });
  const foreign = await db.prisma.membership.findFirstOrThrow({
    where: { workspaceId: b.workspaceId },
  });
  await expect(
    tickets.assign(a, t.id, { expectedVersion: 1, assigneeId: foreign.id }),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await expect(
    tickets.linkCustomer(a, t.id, {
      expectedVersion: 1,
      customerId: c.id,
      verificationReason: ' ',
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  expect(
    await tickets.linkCustomer(a, t.id, {
      expectedVersion: 1,
      customerId: c.id,
      verificationReason: 'Verified against synthetic account record',
    }),
  ).toMatchObject({ customerId: c.id, version: 2 });
  await expect(
    tickets.manualStatus(a, t.id, { expectedVersion: 2, status: 'EXECUTING' }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  await expect(
    tickets.manualStatus(a, t.id, { expectedVersion: 2, status: 'RESOLVED' }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  await tickets.addMessage(a, t.id, {
    body: 'Internal evidence',
    visibility: 'INTERNAL',
  });
  const detail = await tickets.detail(a, t.id);
  expect(detail.customerVerifiedAt).not.toBeNull();
  await expect(
    tickets.update(a, t.id, { expectedVersion: 1, subject: 'Stale' }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  const viewer = await createAuthFixture(db.prisma);
  await db.prisma.profile.create({
    data: { id: viewer.userId, email: viewer.email },
  });
  await db.prisma.membership.create({
    data: { workspaceId: a.workspaceId, userId: viewer.userId, role: 'VIEWER' },
  });
  await expect(
    tickets.addMessage(
      { ...viewer, workspaceId: a.workspaceId, requestId: 'viewer' },
      t.id,
      { body: 'Forbidden' },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
