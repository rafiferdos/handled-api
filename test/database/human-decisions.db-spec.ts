import { randomUUID } from 'node:crypto';
import { createTestDatabase, createAuthFixture } from './helpers.js';
import { goldenFixture } from './golden-fixture.js';
import { ProposalService } from '../../src/modules/proposal/proposal.service.js';
import { ActionPolicy } from '../../src/modules/action/action-policy.js';
const db = createTestDatabase();
afterAll(() => db.close());
it('atomically admits one exact-version action and replays only the same human idempotent request', async () => {
  const f = await goldenFixture(db.prisma),
    service = new ProposalService(f.uow, f.proposals, new ActionPolicy());
  expect(f.proposal.confidence).toBe('HIGH');
  const key = randomUUID();
  const [first, second] = await Promise.all([
    service.approve(f.actor, f.proposal.id, key, { expectedVersion: 1 }),
    service.approve(f.actor, f.proposal.id, key, { expectedVersion: 1 }),
  ]);
  expect(first).toEqual(second);
  expect(
    await db.prisma.actionExecution.count({
      where: { workspaceId: f.actor.workspaceId },
    }),
  ).toBe(1);
  expect(
    await db.prisma.proposalDecision.count({
      where: { workspaceId: f.actor.workspaceId, kind: 'APPROVED' },
    }),
  ).toBe(1);
  await expect(
    service.approve(f.actor, f.proposal.id, key, {
      expectedVersion: 1,
      reason: 'Changed',
    }),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
  await expect(
    service.approve(f.actor, f.proposal.id, randomUUID(), {
      expectedVersion: 1,
    }),
  ).rejects.toMatchObject({ code: 'PROPOSAL_VERSION_CONFLICT' });
});
it('denies stale/archived policy and a VIEWER without creating a decision or action', async () => {
  const f = await goldenFixture(db.prisma),
    service = new ProposalService(f.uow, f.proposals, new ActionPolicy());
  const viewer = await createAuthFixture(db.prisma);
  await db.prisma.profile.create({
    data: { id: viewer.userId, email: viewer.email },
  });
  await db.prisma.membership.create({
    data: {
      workspaceId: f.actor.workspaceId,
      userId: viewer.userId,
      role: 'VIEWER',
    },
  });
  await expect(
    service.approve(
      { ...viewer, workspaceId: f.actor.workspaceId, requestId: randomUUID() },
      f.proposal.id,
      randomUUID(),
      { expectedVersion: 1 },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await f.knowledge.archive(f.actor, f.document.id, { expectedVersion: 1 });
  await expect(
    service.approve(f.actor, f.proposal.id, randomUUID(), {
      expectedVersion: 1,
    }),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_FAILED' });
  expect(
    await db.prisma.actionExecution.count({
      where: { workspaceId: f.actor.workspaceId },
    }),
  ).toBe(0);
  expect(
    await db.prisma.proposalDecision.count({
      where: { workspaceId: f.actor.workspaceId },
    }),
  ).toBe(0);
});
it('refuses edits after ticket closure and never launders an unrelated target into approval', async () => {
  const f = await goldenFixture(db.prisma),
    service = new ProposalService(f.uow, f.proposals, new ActionPolicy());
  const edit = {
    expectedVersion: 1,
    summary: 'Edited summary',
    replyDraft: 'Draft for human review',
    recommendation: f.proposal.recommendation,
  };
  await db.prisma.ticket.update({
    where: { id: f.ticket.id },
    data: { status: 'CLOSED', version: { increment: 1 } },
  });
  await expect(
    service.edit(f.actor, f.proposal.id, edit),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  expect((await f.proposals.read(f.actor, f.proposal.id)).status).toBe('READY');
});
it.each(['REJECTED', 'ESCALATED'] as const)(
  'records %s with a reason and no business action',
  async (kind) => {
    const f = await goldenFixture(db.prisma),
      service = new ProposalService(f.uow, f.proposals, new ActionPolicy());
    const decision = await service.decide(f.actor, f.proposal.id, kind, {
      expectedVersion: 1,
      reason: 'Human decision',
    });
    expect(decision.decision).toBe(kind);
    expect(
      await db.prisma.actionExecution.count({
        where: { workspaceId: f.actor.workspaceId },
      }),
    ).toBe(0);
    expect(
      (await db.prisma.ticket.findUniqueOrThrow({ where: { id: f.ticket.id } }))
        .status,
    ).toBe(kind === 'REJECTED' ? 'REJECTED' : 'NEEDS_REVIEW');
  },
);
