import { randomUUID } from 'node:crypto';
import { createActorFixture, createTestDatabase } from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { InvestigationRepository } from '../../src/modules/investigation/investigation.repository.js';
const db = createTestDatabase(),
  uow = new UnitOfWork(db.prisma),
  runs = new InvestigationRepository(uow);
const metadata = {
  provider: 'test-fixture',
  model: 'signed-test-only',
  promptVersion: 'v1',
};
async function fixture() {
  const actor = await createActorFixture(db.prisma);
  const ticket = await db.prisma.ticket.create({
    data: {
      workspaceId: actor.workspaceId,
      reference: 'TKT-1',
      subject: 'Issue',
    },
  });
  return { actor, ticket };
}
afterAll(() => db.close());
it('admits one active run, compares versions and keeps terminal history on new-run retry', async () => {
  const { actor, ticket } = await fixture();
  const racing = await Promise.allSettled([
    runs.create(actor, ticket.id, metadata),
    runs.create(actor, ticket.id, metadata),
  ]);
  expect(racing.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const run = await db.prisma.investigationRun.findFirstOrThrow({
    where: { workspaceId: actor.workspaceId },
  });
  expect(
    await runs.transition(actor, run.id, {
      expectedVersion: 1,
      status: 'RUNNING',
    }),
  ).toMatchObject({ status: 'RUNNING', version: 2 });
  await expect(
    runs.transition(actor, run.id, {
      expectedVersion: 1,
      status: 'FAILED',
      failureCode: 'AI_PROVIDER_ERROR',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  await runs.recordStep(actor, run.id, {
    sequence: 1,
    type: 'TOOL',
    label: 'Read account',
    status: 'RUNNING',
    toolName: 'getCustomerProfile',
  });
  await expect(
    runs.recordStep(actor, run.id, {
      sequence: 1,
      type: 'CLASSIFY',
      label: 'Different',
      status: 'COMPLETED',
    }),
  ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });
  await runs.finishStep(actor, run.id, 1, {
    status: 'COMPLETED',
    sourceRefs: ['customer-1'],
    durationMs: 10,
  });
  await runs.transition(actor, run.id, {
    expectedVersion: 2,
    status: 'FAILED',
    failureCode: 'AI_PROVIDER_ERROR',
  });
  await expect(
    runs.recordStep(actor, run.id, {
      sequence: 2,
      type: 'CLASSIFY',
      label: 'Late',
      status: 'COMPLETED',
    }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  await expect(
    runs.transition(actor, run.id, { expectedVersion: 3, status: 'RUNNING' }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  const retry = await runs.retry(actor, run.id, metadata);
  expect(retry).toMatchObject({ parentRunId: run.id, status: 'QUEUED' });
  expect(retry.id).not.toBe(run.id);
  expect((await runs.read(actor, run.id)).steps).toHaveLength(1);
  expect(
    (await runs.list(actor, ticket.id, { page: 1, limit: 20 })).meta.total,
  ).toBe(2);
});
it('rejects mismatched same-workspace parents, foreign reads and revoked writers', async () => {
  const { actor, ticket } = await fixture();
  const other = await fixture();
  const run = await runs.create(actor, ticket.id, metadata);
  const second = await db.prisma.ticket.create({
    data: {
      workspaceId: actor.workspaceId,
      reference: 'TKT-2',
      subject: 'Other',
    },
  });
  await expect(
    runs.create(actor, second.id, { ...metadata, parentRunId: run.id }),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  await expect(runs.read(other.actor, run.id)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
  await db.prisma
    .$executeRaw`DELETE FROM auth.sessions WHERE id=${actor.sessionId}::uuid`;
  await expect(
    runs.transition(actor, run.id, { expectedVersion: 1, status: 'RUNNING' }),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  await expect(runs.read(other.actor, randomUUID())).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
});
