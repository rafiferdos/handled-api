import { WorkspaceRole } from '../../src/common/contracts/access-context.js';
import { setTimeout } from 'node:timers/promises';
import {
  createActorFixture,
  createAuthFixture,
  createTestDatabase,
} from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { CustomerService } from '../../src/modules/customer/customer.service.js';
import { InvitationService } from '../../src/modules/workspace/invitation.service.js';
import { TicketService } from '../../src/modules/ticket/ticket.service.js';
import { TicketStateService } from '../../src/modules/ticket/ticket-state.service.js';
import { IdempotencyService } from '../../src/common/database/idempotency.service.js';
import type { Prisma } from '../../src/generated/prisma/client.js';
const db = createTestDatabase(),
  uow = new UnitOfWork(db.prisma),
  customers = new CustomerService(uow),
  invites = new InvitationService(uow);
const tickets = new TicketService(
  uow,
  new IdempotencyService(uow),
  new TicketStateService(),
);
afterAll(() => db.close());
async function waitForWorkspaceLock() {
  for (let attempt = 0; attempt < 100; attempt++) {
    const rows = await db.prisma.$queryRaw<
      Array<{ n: number }>
    >`SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%handled."Workspace"%'`;
    if (rows[0]?.n) return;
    await setTimeout(10);
  }
  throw new Error('Contested workspace lock not observed');
}
async function race<T>(
  workspaceId: string,
  change: (tx: Prisma.TransactionClient) => Promise<unknown>,
  start: () => Promise<T>,
  beforeRelease?: () => Promise<void>,
) {
  let release!: () => void;
  let locked!: () => void;
  const held = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const blocker = db.prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM handled."Workspace" WHERE id=${workspaceId}::uuid FOR UPDATE`;
      await change(tx);
      locked();
      await gate;
    },
    { timeout: 10000 },
  );
  await held;
  const mutation = start().then(
    (value) => ({ status: 'fulfilled' as const, value }),
    (reason) => ({ status: 'rejected' as const, reason }),
  );
  try {
    await waitForWorkspaceLock();
    await beforeRelease?.();
  } finally {
    release();
    await blocker;
  }
  return mutation;
}
it('denies an AGENT demoted while its transaction waits, rather than using an old snapshot', async () => {
  const admin = await createActorFixture(db.prisma),
    agent = await createAuthFixture(db.prisma);
  await db.prisma.profile.create({
    data: { id: agent.userId, email: agent.email },
  });
  await db.prisma.membership.create({
    data: {
      workspaceId: admin.workspaceId,
      userId: agent.userId,
      role: 'AGENT',
    },
  });
  const actor = {
    ...agent,
    workspaceId: admin.workspaceId,
    requestId: 'role-race',
  };
  const result = await race(
    admin.workspaceId,
    (tx) =>
      tx.membership.update({
        where: {
          workspaceId_userId: {
            workspaceId: admin.workspaceId,
            userId: agent.userId,
          },
        },
        data: { role: 'VIEWER' },
      }),
    () =>
      customers.create(actor, {
        externalRef: 'race',
        name: 'Denied',
        email: 'denied@example.invalid',
      }),
  );
  expect(result).toMatchObject({
    status: 'rejected',
    reason: { code: 'FORBIDDEN' },
  });
  expect(
    await db.prisma.customer.count({
      where: { workspaceId: admin.workspaceId },
    }),
  ).toBe(0);
});
it('observes a newly blocked customer after the workspace wait', async () => {
  const actor = await createActorFixture(db.prisma);
  const c = await customers.create(actor, {
    externalRef: 'CUS',
    name: 'Maya',
    email: 'maya@example.invalid',
  });
  const t = await tickets.create(actor, 'customer-race', {
    subject: 'Issue',
    body: 'Verify account',
  });
  const result = await race(
    actor.workspaceId,
    (tx) =>
      tx.customer.update({ where: { id: c.id }, data: { status: 'BLOCKED' } }),
    () =>
      tickets.linkCustomer(actor, t.id, {
        expectedVersion: 1,
        customerId: c.id,
        verificationReason: 'Synthetic check',
      }),
  );
  expect(result).toMatchObject({
    status: 'rejected',
    reason: { code: 'BUSINESS_RULE_FAILED' },
  });
  expect(
    (await db.prisma.ticket.findUniqueOrThrow({ where: { id: t.id } }))
      .customerId,
  ).toBeNull();
});
it.each(['jwt', 'session'] as const)(
  'rolls back customer creation when %s expires during the lock wait',
  async (mode) => {
    const actor = await createActorFixture(db.prisma);
    const expiresAt = Math.floor(Date.now() / 1000) + 2;
    if (mode === 'jwt') actor.expiresAt = expiresAt;
    else
      await db.prisma
        .$executeRaw`UPDATE auth.sessions SET not_after=${new Date(expiresAt * 1000)} WHERE id=${actor.sessionId}::uuid`;
    const result = await race(
      actor.workspaceId,
      async () => undefined,
      () =>
        customers.create(actor, {
          externalRef: 'expired',
          name: 'Expired',
          email: 'expired@example.invalid',
        }),
      () => setTimeout(Math.max(0, expiresAt * 1000 - Date.now() + 30)),
    );
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { code: 'UNAUTHENTICATED' },
    });
    expect(
      await db.prisma.customer.count({
        where: { workspaceId: actor.workspaceId },
      }),
    ).toBe(0);
  },
);
it('reloads revoked invitations after the contested workspace lock', async () => {
  const actor = await createActorFixture(db.prisma),
    recipient = await createAuthFixture(db.prisma);
  const issued = await invites.create(actor, {
    email: recipient.email,
    role: WorkspaceRole.AGENT,
  });
  const result = await race(
    actor.workspaceId,
    (tx) =>
      tx.invite.update({
        where: { id: issued.id },
        data: { revokedAt: new Date() },
      }),
    () => invites.accept(recipient, issued.token),
  );
  expect(result).toMatchObject({
    status: 'rejected',
    reason: { code: 'INVALID_STATE_TRANSITION' },
  });
  expect(
    await db.prisma.membership.count({
      where: { workspaceId: actor.workspaceId, userId: recipient.userId },
    }),
  ).toBe(0);
});

it.each(['jwt', 'session'] as const)(
  'rejects invite acceptance after %s expiry during its workspace wait',
  async (mode) => {
    const actor = await createActorFixture(db.prisma),
      recipient = await createAuthFixture(db.prisma);
    const issued = await invites.create(actor, {
      email: recipient.email,
      role: WorkspaceRole.AGENT,
    });
    const expiresAt = Math.floor(Date.now() / 1000) + 2;
    if (mode === 'jwt') recipient.expiresAt = expiresAt;
    else
      await db.prisma
        .$executeRaw`UPDATE auth.sessions SET not_after=${new Date(expiresAt * 1000)} WHERE id=${recipient.sessionId}::uuid`;
    const result = await race(
      actor.workspaceId,
      async () => undefined,
      () => invites.accept(recipient, issued.token),
      () => setTimeout(Math.max(0, expiresAt * 1000 - Date.now() + 30)),
    );
    expect(result).toMatchObject({
      status: 'rejected',
      reason: { code: 'UNAUTHENTICATED' },
    });
    expect(
      await db.prisma.membership.count({
        where: { workspaceId: actor.workspaceId, userId: recipient.userId },
      }),
    ).toBe(0);
  },
);

it('checks the invite creator current role after waiting', async () => {
  const actor = await createActorFixture(db.prisma),
    recipient = await createAuthFixture(db.prisma),
    otherAdmin = await createAuthFixture(db.prisma);
  await db.prisma.profile.create({
    data: { id: otherAdmin.userId, email: otherAdmin.email },
  });
  await db.prisma.membership.create({
    data: {
      workspaceId: actor.workspaceId,
      userId: otherAdmin.userId,
      role: 'ADMIN',
    },
  });
  const issued = await invites.create(actor, {
    email: recipient.email,
    role: WorkspaceRole.AGENT,
  });
  const result = await race(
    actor.workspaceId,
    (tx) =>
      tx.membership.update({
        where: {
          workspaceId_userId: {
            workspaceId: actor.workspaceId,
            userId: actor.userId,
          },
        },
        data: { role: 'AGENT' },
      }),
    () => invites.accept(recipient, issued.token),
  );
  expect(result).toMatchObject({
    status: 'rejected',
    reason: { code: 'INVALID_STATE_TRANSITION' },
  });
});
