import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import { isIdempotencyKey } from '../../common/contracts/idempotency.contracts.js';
import { canonicalJson, sha256 } from '../../common/database/json.js';
import { parseContract } from '../../common/validation/parse-contract.js';
import { ProposalRepository } from './proposal.repository.js';
import { ActionPolicy } from '../action/action-policy.js';
import { enqueueJob } from '../queue/job-contracts.js';
import { writeAudit } from '../audit/audit-writer.js';
import type { EditProposalRequestDto } from './dto/proposal-request.dto.js';
const approveSchema = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2147483647),
  reason: z.string().trim().min(1).max(2000).optional(),
});
const receiptSchema = z.strictObject({
  actionExecutionId: z.uuid(),
  status: z.literal('QUEUED'),
});
@Injectable()
export class ProposalService {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(ProposalRepository) private readonly proposals: ProposalRepository,
    @Inject(ActionPolicy) private readonly policy: ActionPolicy,
  ) {}
  approve(
    actor: WorkspaceActor,
    id: string,
    key: string,
    input: z.input<typeof approveSchema>,
  ) {
    if (!isIdempotencyKey(key)) throw new AppException('VALIDATION_ERROR');
    const body = parseContract(approveSchema, input),
      hash = sha256(canonicalJson(body));
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      const scope = {
        workspaceId: actor.workspaceId,
        actorScope: actor.userId,
        operation: 'proposal.approve',
        target: id,
        key,
      };
      const previous = await tx.idempotencyRecord.findUnique({
        where: { workspaceId_actorScope_operation_target_key: scope },
      });
      if (previous) {
        if (previous.requestHash !== hash)
          throw new AppException('IDEMPOTENCY_CONFLICT');
        return receiptSchema.parse(previous.response);
      }
      const proposal = await tx.proposal.findUnique({
        where: { workspaceId_id: { workspaceId: actor.workspaceId, id } },
      });
      if (!proposal) throw new AppException('RESOURCE_NOT_FOUND');
      if (
        proposal.version !== body.expectedVersion ||
        proposal.status !== 'READY'
      )
        throw new AppException('PROPOSAL_VERSION_CONFLICT');
      if (proposal.confidence === 'MEDIUM' && !body.reason)
        throw new AppException('BUSINESS_RULE_FAILED');
      const eligible = await this.policy.validate(tx, actor.workspaceId, id);
      const decision = await this.proposals.recordDecision(tx, actor, id, {
        ...body,
        kind: 'APPROVED',
      });
      const action = await tx.actionExecution.create({
        data: {
          workspaceId: actor.workspaceId,
          ticketId: proposal.ticketId,
          proposalId: id,
          proposalVersion: body.expectedVersion,
          decisionId: decision.id,
          type: eligible.type,
          targetId: eligible.targetId,
          targetRef: eligible.targetRef,
          requestId: actor.requestId,
        },
      });
      await tx.ticket.update({
        where: { id: proposal.ticketId },
        data: { status: 'EXECUTING', version: { increment: 1 } },
      });
      await enqueueJob(
        tx,
        actor.workspaceId,
        'action',
        action.id,
        actor.requestId,
      );
      const result = receiptSchema.parse({
        actionExecutionId: action.id,
        status: 'QUEUED',
      });
      await tx.idempotencyRecord.create({
        data: { ...scope, requestHash: hash, response: result },
      });
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: proposal.ticketId,
        eventType: 'action.queued',
        metadata: {
          actionExecutionId: action.id,
          proposalId: id,
          proposalVersion: body.expectedVersion,
        },
      });
      return result;
    });
  }
  edit(actor: WorkspaceActor, id: string, input: EditProposalRequestDto) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      const p = await tx.proposal.findUnique({
        where: { workspaceId_id: { workspaceId: actor.workspaceId, id } },
      });
      if (!p) throw new AppException('RESOURCE_NOT_FOUND');
      const ticket = await tx.ticket.findUniqueOrThrow({
        where: {
          workspaceId_id: { workspaceId: actor.workspaceId, id: p.ticketId },
        },
      });
      if (!['AWAITING_APPROVAL', 'NEEDS_REVIEW'].includes(ticket.status))
        throw new AppException('INVALID_STATE_TRANSITION');
      const run = await tx.investigationRun.findUniqueOrThrow({
        where: {
          workspaceId_id: {
            workspaceId: actor.workspaceId,
            id: p.investigationId,
          },
        },
      });
      if (
        await tx.investigationRun.count({
          where: {
            workspaceId: actor.workspaceId,
            ticketId: p.ticketId,
            id: { not: run.id },
            createdAt: { gte: run.createdAt },
          },
        })
      )
        throw new AppException('PROPOSAL_VERSION_CONFLICT');
      const revised = await this.proposals.reviseInTransaction(
        tx,
        actor,
        id,
        input,
      );
      if (revised.recommendation !== null && revised.confidence !== 'LOW')
        await this.policy.validate(tx, actor.workspaceId, revised.id);
      return revised;
    });
  }
  decide(
    actor: WorkspaceActor,
    id: string,
    kind: 'REJECTED' | 'ESCALATED',
    input: { expectedVersion: number; reason: string },
  ) {
    const body = parseContract(
      approveSchema.extend({ reason: z.string().trim().min(1).max(2000) }),
      input,
    );
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      const p = await tx.proposal.findUnique({
        where: { workspaceId_id: { workspaceId: actor.workspaceId, id } },
      });
      if (!p) throw new AppException('RESOURCE_NOT_FOUND');
      const ticket = await tx.ticket.findUniqueOrThrow({
        where: {
          workspaceId_id: { workspaceId: actor.workspaceId, id: p.ticketId },
        },
      });
      if (!['AWAITING_APPROVAL', 'NEEDS_REVIEW'].includes(ticket.status))
        throw new AppException('INVALID_STATE_TRANSITION');
      if (
        await tx.investigationRun.count({
          where: {
            workspaceId: actor.workspaceId,
            ticketId: p.ticketId,
            id: { not: p.investigationId },
            createdAt: { gte: p.createdAt },
          },
        })
      )
        throw new AppException('PROPOSAL_VERSION_CONFLICT');
      const result = await this.proposals.recordDecision(tx, actor, id, {
        ...body,
        kind,
      });
      await tx.ticket.update({
        where: { id: p.ticketId },
        data: {
          status: kind === 'REJECTED' ? 'REJECTED' : 'NEEDS_REVIEW',
          version: { increment: 1 },
        },
      });
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: p.ticketId,
        eventType: `proposal.${kind.toLowerCase()}`,
        metadata: { proposalId: id },
      });
      return {
        decisionId: result.id,
        proposalId: result.proposalId,
        proposalVersion: result.proposalVersion,
        decision: result.kind,
        actorUserId: result.actorUserId,
        reason: result.reason,
        createdAt: result.createdAt,
      };
    });
  }
}
