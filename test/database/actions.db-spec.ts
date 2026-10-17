import { randomUUID } from 'node:crypto';
import { createTestDatabase } from './helpers.js';
import { goldenFixture, deliverJob } from './golden-fixture.js';
import { ProposalService } from '../../src/modules/proposal/proposal.service.js';
import { ActionPolicy } from '../../src/modules/action/action-policy.js';
import { ActionProcessor } from '../../src/modules/action/action-processor.js';
import { ActionService } from '../../src/modules/action/action.service.js';
const db = createTestDatabase();
afterAll(() => db.close());
it.each(['refund', 'cancel', 'restore'] as const)(
  'executes %s once and records atomic before/after history',
  async (kind) => {
    const f = await goldenFixture(db.prisma, kind),
      policy = new ActionPolicy(),
      service = new ProposalService(f.uow, f.proposals, policy);
    new ActionProcessor(f.uow, policy, f.registry).onModuleInit();
    const queued = await service.approve(f.actor, f.proposal.id, randomUUID(), {
      expectedVersion: 1,
    });
    const delivery = await deliverJob(
      db.prisma,
      f.dispatcher,
      f.actor.workspaceId,
      'job.action',
    );
    await Promise.all([
      f.dispatcher.process(delivery),
      f.dispatcher.process(delivery),
    ]);
    const action = await db.prisma.actionExecution.findUniqueOrThrow({
      where: { id: queued.actionExecutionId },
    });
    expect(action).toMatchObject({ status: 'SUCCEEDED', attempts: 1 });
    expect(action.beforeState).not.toEqual(action.afterState);
    expect(
      await db.prisma.auditEvent.count({
        where: {
          workspaceId: f.actor.workspaceId,
          eventType: 'action.completed',
        },
      }),
    ).toBe(1);
    if (kind === 'refund') {
      expect(
        (
          await db.prisma.payment.findUniqueOrThrow({
            where: { id: f.duplicate.id },
          })
        ).status,
      ).toBe('REFUNDED');
      expect(
        (
          await db.prisma.payment.findUniqueOrThrow({
            where: { id: f.payment.id },
          })
        ).status,
      ).toBe('SETTLED');
    }
    if (kind === 'cancel') {
      expect(
        await db.prisma.subscription.findUniqueOrThrow({
          where: { id: f.subscription.id },
        }),
      ).toMatchObject({
        cancelAtPeriodEnd: true,
        currentPeriodEnd: f.subscription.currentPeriodEnd,
      });
      expect(
        await db.prisma.productAccess.findUniqueOrThrow({
          where: { id: f.access.id },
        }),
      ).toMatchObject({ status: 'REVOKED', version: 1 });
    }
    if (kind === 'restore')
      expect(
        await db.prisma.productAccess.findUniqueOrThrow({
          where: { id: f.access.id },
        }),
      ).toMatchObject({ status: 'ACTIVE', version: 2 });
  },
);
it('denies execution after the approving session is revoked and never blindly retries unknown outcomes', async () => {
  const f = await goldenFixture(db.prisma),
    policy = new ActionPolicy(),
    service = new ProposalService(f.uow, f.proposals, policy);
  new ActionProcessor(f.uow, policy, f.registry).onModuleInit();
  const queued = await service.approve(f.actor, f.proposal.id, randomUUID(), {
    expectedVersion: 1,
  });
  await db.prisma
    .$executeRaw`UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=${f.actor.sessionId}::uuid`;
  await deliverJob(db.prisma, f.dispatcher, f.actor.workspaceId, 'job.action');
  const action = await db.prisma.actionExecution.findUniqueOrThrow({
    where: { id: queued.actionExecutionId },
  });
  expect(action).toMatchObject({
    status: 'FAILED',
    failureCode: 'UNAUTHENTICATED',
    retryable: false,
  });
  expect(
    (
      await db.prisma.payment.findUniqueOrThrow({
        where: { id: f.duplicate.id },
      })
    ).status,
  ).toBe('SETTLED');
  await db.prisma
    .$executeRaw`UPDATE auth.sessions SET not_after=null WHERE id=${f.actor.sessionId}::uuid`;
  await db.prisma.actionExecution.update({
    where: { id: action.id },
    data: { status: 'OUTCOME_UNKNOWN' },
  });
  const actions = new ActionService(f.uow, policy);
  await expect(
    actions.retry(f.actor, action.id, { expectedVersion: action.version }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  expect(
    await actions.reconcile(f.actor, action.id, {
      expectedVersion: action.version,
    }),
  ).toMatchObject({
    status: 'OUTCOME_UNKNOWN',
    reconciliation: 'MANUAL_REVIEW_REQUIRED',
  });
});
it('rechecks archived policy at execution and retains settled business rows', async () => {
  const f = await goldenFixture(db.prisma),
    policy = new ActionPolicy(),
    service = new ProposalService(f.uow, f.proposals, policy);
  new ActionProcessor(f.uow, policy, f.registry).onModuleInit();
  const queued = await service.approve(f.actor, f.proposal.id, randomUUID(), {
    expectedVersion: 1,
  });
  await f.knowledge.archive(f.actor, f.document.id, { expectedVersion: 1 });
  await deliverJob(db.prisma, f.dispatcher, f.actor.workspaceId, 'job.action');
  expect(
    await db.prisma.actionExecution.findUniqueOrThrow({
      where: { id: queued.actionExecutionId },
    }),
  ).toMatchObject({ status: 'FAILED', failureCode: 'BUSINESS_RULE_FAILED' });
  expect(
    (
      await db.prisma.payment.findUniqueOrThrow({
        where: { id: f.duplicate.id },
      })
    ).status,
  ).toBe('SETTLED');
});
