import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client.js';
import type {
  Proposal,
  ProposalSource,
} from '../../generated/prisma/client.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import { parseContract } from '../../common/validation/parse-contract.js';
import { rethrowDatabaseError } from '../../common/database/database-errors.js';
import { proposalOutputSchema } from '../ai/contracts/proposal-output.schema.js';
import type { ProposalOutput } from '../ai/contracts/proposal-output.schema.js';
import { textSchema } from '../ai/contracts/contract-primitives.js';
import { evidenceSourceSchema } from './contracts/evidence.schema.js';
import type { EvidenceSource } from './contracts/evidence.schema.js';
import { recommendationSchema } from './contracts/recommendation.schema.js';
import { requireRun } from '../investigation/investigation.repository.js';
import { writeAudit } from '../audit/audit-writer.js';
const version = z.number().int().min(1).max(2147483647);
const editSchema = z.strictObject({
  expectedVersion: version,
  summary: textSchema(4000),
  replyDraft: textSchema(10000),
  recommendation: recommendationSchema.nullable(),
});
const decisionSchema = z
  .strictObject({
    expectedVersion: version,
    kind: z.enum(['APPROVED', 'REJECTED', 'ESCALATED']),
    reason: textSchema(2000).optional(),
  })
  .refine((v) => v.kind === 'APPROVED' || v.reason !== undefined);
const sourcesSchema = z
  .array(evidenceSourceSchema)
  .max(50)
  .refine((s) =>
    s.every(
      (v) => v.sourceType !== 'KNOWLEDGE' || v.documentVersion <= 2147483647,
    ),
  );
function sourceProjection(s: ProposalSource): EvidenceSource {
  const base = {
    sourceRefId: s.sourceRefId,
    title: s.title,
    excerpt: s.excerpt,
    contentHash: s.contentHash,
    observedAt: s.observedAt.toISOString(),
  };
  return evidenceSourceSchema.parse(
    s.sourceType === 'TOOL'
      ? { sourceType: 'TOOL', ...base }
      : {
          sourceType: 'KNOWLEDGE',
          ...base,
          documentId: s.documentId,
          documentVersion: s.documentVersion,
          chunkId: s.chunkId,
          score: s.score,
        },
  );
}
function project(p: Proposal, sources: ProposalSource[]) {
  const evidence = sources.map(sourceProjection);
  const output = proposalOutputSchema.parse({
    category: p.category,
    summary: p.summary,
    confidence: p.confidence,
    missingFacts: p.missingFacts,
    recommendation: p.recommendationPayload,
    replyDraft: p.replyDraft,
    evidenceRefs: evidence.map((s) => s.sourceRefId),
  });
  return {
    id: p.id,
    workspaceId: p.workspaceId,
    ticketId: p.ticketId,
    investigationId: p.investigationId,
    version: p.version,
    status: p.status,
    ...output,
    sources: evidence,
    createdAt: p.createdAt.toISOString(),
  };
}
async function stored(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
) {
  const p = await tx.proposal.findUnique({
    where: { workspaceId_id: { workspaceId, id } },
  });
  if (!p) throw new AppException('RESOURCE_NOT_FOUND');
  return p;
}
async function sourceRows(tx: Prisma.TransactionClient, p: Proposal) {
  return tx.proposalSource.findMany({
    where: { workspaceId: p.workspaceId, proposalId: p.id },
    orderBy: { sourceRefId: 'asc' },
    take: 50,
  });
}
@Injectable()
export class ProposalRepository {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  async create(
    actor: WorkspaceActor,
    ticketId: string,
    runId: string,
    output: unknown,
    sources: unknown,
  ) {
    try {
      return await this.uow.run((tx) =>
        this.createInTransaction(tx, actor, ticketId, runId, output, sources),
      );
    } catch (error) {
      rethrowDatabaseError(error);
    }
  }
  async createInTransaction(
    tx: Prisma.TransactionClient,
    actor: WorkspaceActor,
    ticketId: string,
    runId: string,
    output: unknown,
    sources: unknown,
  ) {
    await assertWorkspaceActor(tx, actor, WRITERS);
    const content = parseContract(proposalOutputSchema, output),
      evidence = parseContract(sourcesSchema, sources);
    const refs = new Set(evidence.map((s) => s.sourceRefId));
    if (
      refs.size !== evidence.length ||
      refs.size !== content.evidenceRefs.length ||
      content.evidenceRefs.some((ref) => !refs.has(ref))
    )
      throw new AppException('VALIDATION_ERROR');
    const run = await requireRun(tx, actor.workspaceId, runId);
    if (run.ticketId !== ticketId.toLowerCase())
      throw new AppException('RESOURCE_NOT_FOUND');
    if (run.status !== 'RUNNING')
      throw new AppException('INVALID_STATE_TRANSITION');
    return this.persist(tx, actor, ticketId, run.id, 1, content, evidence);
  }
  read(actor: WorkspaceActor, id: string) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const p = await stored(tx, actor.workspaceId, id);
      return project(p, await sourceRows(tx, p));
    });
  }
  revise(actor: WorkspaceActor, id: string, input: z.input<typeof editSchema>) {
    const data = parseContract(editSchema, input);
    return this.uow.run(async (tx) => {
      const member = await assertWorkspaceActor(tx, actor, WRITERS);
      const old = await stored(tx, actor.workspaceId, id);
      if (
        old.version !== data.expectedVersion ||
        old.status !== 'READY' ||
        old.version === 2147483647
      )
        throw new AppException('PROPOSAL_VERSION_CONFLICT');
      const evidence = await sourceRows(tx, old),
        previous = project(old, evidence);
      const output = parseContract(proposalOutputSchema, {
        category: previous.category,
        summary: data.summary,
        replyDraft: data.replyDraft,
        recommendation: data.recommendation,
        confidence: data.recommendation === null ? 'LOW' : previous.confidence,
        missingFacts: previous.missingFacts,
        evidenceRefs: previous.evidenceRefs,
      });
      await tx.proposalDecision.create({
        data: {
          workspaceId: actor.workspaceId,
          proposalId: old.id,
          proposalVersion: old.version,
          kind: 'EDITED',
          actorUserId: actor.userId,
          actorMembershipId: member.id,
          actorSessionId: actor.sessionId,
          requestId: actor.requestId,
        },
      });
      await tx.proposal.update({
        where: { id: old.id },
        data: { status: 'SUPERSEDED' },
      });
      const current = await this.persist(
        tx,
        actor,
        old.ticketId,
        old.investigationId,
        old.version + 1,
        output,
        previous.sources,
      );
      await writeAudit(tx, actor, {
        entityType: 'proposal',
        entityId: current.id,
        eventType: 'proposal.revised',
        metadata: { previousProposalId: old.id, previousVersion: old.version },
      });
      return current;
    });
  }
  /** Internal persistence only. The caller must perform policy/current-ticket
   * admission and write any action/outbox in this SAME transaction (Step 9). */
  async recordDecision(
    tx: Prisma.TransactionClient,
    actor: WorkspaceActor,
    id: string,
    input: z.input<typeof decisionSchema>,
  ) {
    const data = parseContract(decisionSchema, input);
    const member = await assertWorkspaceActor(tx, actor, WRITERS);
    const p = await stored(tx, actor.workspaceId, id);
    if (p.version !== data.expectedVersion || p.status !== 'READY')
      throw new AppException('PROPOSAL_VERSION_CONFLICT');
    if (
      data.kind === 'APPROVED' &&
      (!p.recommendationType || p.confidence === 'LOW')
    )
      throw new AppException('BUSINESS_RULE_FAILED');
    const result = await tx.proposal.updateMany({
      where: {
        workspaceId: actor.workspaceId,
        id,
        version: data.expectedVersion,
        status: 'READY',
      },
      data: { status: data.kind },
    });
    if (!result.count) throw new AppException('PROPOSAL_VERSION_CONFLICT');
    const d = await tx.proposalDecision.create({
      data: {
        workspaceId: actor.workspaceId,
        proposalId: p.id,
        proposalVersion: p.version,
        kind: data.kind,
        actorUserId: actor.userId,
        actorMembershipId: member.id,
        actorSessionId: actor.sessionId,
        requestId: actor.requestId,
        reason: data.reason,
      },
    });
    await writeAudit(tx, actor, {
      entityType: 'proposal',
      entityId: id,
      eventType: 'proposal.decision_recorded',
      metadata: { kind: d.kind, version: d.proposalVersion },
    });
    return {
      id: d.id,
      proposalId: d.proposalId,
      proposalVersion: d.proposalVersion,
      kind: d.kind,
      actorUserId: d.actorUserId,
      reason: d.reason,
      createdAt: d.createdAt.toISOString(),
    };
  }
  private async persist(
    tx: Prisma.TransactionClient,
    actor: WorkspaceActor,
    ticketId: string,
    runId: string,
    version: number,
    output: ProposalOutput,
    evidence: readonly EvidenceSource[],
  ) {
    const p = await tx.proposal.create({
      data: {
        workspaceId: actor.workspaceId,
        ticketId,
        investigationId: runId,
        version,
        status: 'READY',
        category: output.category,
        confidence: output.confidence,
        summary: output.summary,
        replyDraft: output.replyDraft,
        missingFacts: [...output.missingFacts],
        recommendationType: output.recommendation?.type,
        recommendationPayload: output.recommendation ?? Prisma.DbNull,
      },
    });
    for (const source of evidence)
      await tx.proposalSource.create({
        data: {
          workspaceId: actor.workspaceId,
          proposalId: p.id,
          ...source,
          observedAt: new Date(source.observedAt),
        },
      });
    await writeAudit(tx, actor, {
      entityType: 'proposal',
      entityId: p.id,
      eventType: 'proposal.persisted',
      metadata: { version },
    });
    return project(p, await sourceRows(tx, p));
  }
}
