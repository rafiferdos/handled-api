import { createActorFixture, createTestDatabase } from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { InvestigationRepository } from '../../src/modules/investigation/investigation.repository.js';
import { ProposalRepository } from '../../src/modules/proposal/proposal.repository.js';
const db = createTestDatabase(),
  uow = new UnitOfWork(db.prisma),
  runs = new InvestigationRepository(uow),
  proposals = new ProposalRepository(uow);
const output = {
  category: 'OTHER',
  summary: 'Needs manual review',
  confidence: 'LOW',
  missingFacts: ['No verified account'],
  recommendation: null,
  replyDraft: 'Please verify your account.',
  evidenceRefs: [],
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
  const run = await runs.create(actor, ticket.id, {
    provider: 'fixture',
    model: 'fixture',
    promptVersion: 'v1',
  });
  await runs.transition(actor, run.id, {
    expectedVersion: 1,
    status: 'RUNNING',
  });
  return { actor, ticket, run };
}
afterAll(() => db.close());
it('rejects malformed payloads and persists LOW/null recommendations with immutable evidence', async () => {
  const f = await fixture();
  await expect(
    proposals.create(
      f.actor,
      f.ticket.id,
      f.run.id,
      { ...output, category: 'ARBITRARY_CATEGORY' },
      [],
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  await expect(
    proposals.create(
      f.actor,
      f.ticket.id,
      f.run.id,
      { ...output, confidence: 'HIGH' },
      [],
    ),
  ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  const p = await proposals.create(f.actor, f.ticket.id, f.run.id, output, []);
  expect(p).toMatchObject({
    version: 1,
    confidence: 'LOW',
    recommendation: null,
    status: 'READY',
  });
  await expect(
    db.prisma.proposal.update({
      where: { id: p.id },
      data: { summary: 'Overwrite' },
    }),
  ).rejects.toMatchObject({ code: 'P2039' });
  const foreign = await fixture();
  await expect(proposals.read(foreign.actor, p.id)).rejects.toMatchObject({
    code: 'RESOURCE_NOT_FOUND',
  });
});
it('makes edits new immutable revisions and rejects stale/concurrent edits and decisions', async () => {
  const f = await fixture();
  const p = await proposals.create(f.actor, f.ticket.id, f.run.id, output, []);
  const edits = await Promise.allSettled([
    proposals.revise(f.actor, p.id, {
      expectedVersion: 1,
      summary: 'Edited once',
      replyDraft: 'New reply',
      recommendation: null,
    }),
    proposals.revise(f.actor, p.id, {
      expectedVersion: 1,
      summary: 'Other edit',
      replyDraft: 'Other reply',
      recommendation: null,
    }),
  ]);
  expect(edits.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  const old = await proposals.read(f.actor, p.id);
  expect(old).toMatchObject({ status: 'SUPERSEDED', summary: output.summary });
  const current = await db.prisma.proposal.findFirstOrThrow({
    where: { workspaceId: f.actor.workspaceId, status: 'READY' },
  });
  expect(current.id).not.toBe(p.id);
  expect(current.version).toBe(2);
  await expect(
    uow.runAs(f.actor, (tx) =>
      proposals.recordDecision(tx, f.actor, p.id, {
        expectedVersion: 1,
        kind: 'REJECTED',
        reason: 'Stale',
      }),
    ),
  ).rejects.toMatchObject({ code: 'PROPOSAL_VERSION_CONFLICT' });
  await expect(
    uow.runAs(f.actor, (tx) =>
      proposals.recordDecision(tx, f.actor, current.id, {
        expectedVersion: 1,
        kind: 'REJECTED',
        reason: 'Wrong version',
      }),
    ),
  ).rejects.toMatchObject({ code: 'PROPOSAL_VERSION_CONFLICT' });
  const decision = await uow.runAs(f.actor, (tx) =>
    proposals.recordDecision(tx, f.actor, current.id, {
      expectedVersion: 2,
      kind: 'REJECTED',
      reason: 'Human review rejects',
    }),
  );
  expect(decision).toMatchObject({
    proposalId: current.id,
    proposalVersion: 2,
    kind: 'REJECTED',
    actorUserId: f.actor.userId,
  });
  expect((await proposals.read(f.actor, current.id)).status).toBe('REJECTED');
  await expect(
    uow.runAs(f.actor, (tx) =>
      proposals.recordDecision(tx, f.actor, current.id, {
        expectedVersion: 2,
        kind: 'APPROVED',
      }),
    ),
  ).rejects.toMatchObject({ code: 'PROPOSAL_VERSION_CONFLICT' });
});
it('rolls back a decision and lifecycle metadata when its caller transaction fails', async () => {
  const f = await fixture();
  const p = await proposals.create(f.actor, f.ticket.id, f.run.id, output, []);
  await expect(
    uow.runAs(f.actor, async (tx) => {
      await proposals.recordDecision(tx, f.actor, p.id, {
        expectedVersion: 1,
        kind: 'ESCALATED',
        reason: 'Needs specialist',
      });
      throw new Error('rollback coordinator');
    }),
  ).rejects.toThrow('rollback coordinator');
  expect((await proposals.read(f.actor, p.id)).status).toBe('READY');
  expect(
    await db.prisma.proposalDecision.count({
      where: { workspaceId: f.actor.workspaceId },
    }),
  ).toBe(0);
});

it('copies exact evidence snapshots to new revisions and prevents source overwrites', async () => {
  const f = await fixture();
  const source = {
    sourceType: 'TOOL',
    sourceRefId: 'payment-1',
    title: 'Payment snapshot',
    excerpt: 'SETTLED 2900 USD',
    contentHash: 'a'.repeat(64),
    observedAt: new Date().toISOString(),
  };
  const p = await proposals.create(
    f.actor,
    f.ticket.id,
    f.run.id,
    { ...output, evidenceRefs: ['payment-1'] },
    [source],
  );
  expect(p.sources).toEqual([source]);
  const revised = await proposals.revise(f.actor, p.id, {
    expectedVersion: 1,
    summary: 'Human clarification',
    replyDraft: 'Updated response',
    recommendation: null,
  });
  expect(revised.sources).toEqual(p.sources);
  const row = await db.prisma.proposalSource.findFirstOrThrow({
    where: { proposalId: p.id },
  });
  await expect(
    db.prisma.proposalSource.update({
      where: { id: row.id },
      data: { excerpt: 'Tampered' },
    }),
  ).rejects.toMatchObject({ code: 'P2039' });
  expect((await proposals.read(f.actor, p.id)).sources).toEqual([source]);
});

it('rolls back an already-written decision if its caller identity expires before commit', async () => {
  const f = await fixture();
  const p = await proposals.create(f.actor, f.ticket.id, f.run.id, output, []);
  f.actor.expiresAt = Math.floor(Date.now() / 1000) + 2;
  await expect(
    uow.runAs(f.actor, async (tx) => {
      await proposals.recordDecision(tx, f.actor, p.id, {
        expectedVersion: 1,
        kind: 'REJECTED',
        reason: 'Human review',
      });
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, f.actor.expiresAt * 1000 - Date.now() + 30),
        ),
      );
    }),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  expect(
    (await db.prisma.proposal.findUniqueOrThrow({ where: { id: p.id } }))
      .status,
  ).toBe('READY');
  expect(
    await db.prisma.proposalDecision.count({
      where: { workspaceId: f.actor.workspaceId },
    }),
  ).toBe(0);
});
