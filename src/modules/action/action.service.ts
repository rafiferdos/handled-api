import { Inject, Injectable } from '@nestjs/common';
import type { Prisma, ActionExecution } from '../../generated/prisma/client.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import { parseContract } from '../../common/validation/parse-contract.js';
import { z } from 'zod';
import { ActionPolicy } from './action-policy.js';
import { requireTicket } from '../ticket/ticket.service.js';
import { enqueueJob } from '../queue/job-contracts.js';
import { writeAudit } from '../audit/audit-writer.js';
import {
  paymentProjection,
  paymentSelect,
  subscriptionProjection,
  subscriptionSelect,
  accessProjection,
  accessSelect,
} from '../billing/account-projections.js';
const admins = [WorkspaceRole.ADMIN];
const versionSchema = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2147483647),
});
export const actionProjection = (a: ActionExecution) => ({
  id: a.id,
  ticketId: a.ticketId,
  proposalId: a.proposalId,
  proposalVersion: a.proposalVersion,
  type: a.type,
  targetRef: a.targetRef,
  status: a.status,
  attempts: a.attempts,
  version: a.version,
  beforeState: a.beforeState,
  afterState: a.afterState,
  failureCode: a.failureCode,
  retryable: a.retryable,
  simulation: true,
  createdAt: a.createdAt.toISOString(),
  finishedAt: a.finishedAt?.toISOString() ?? null,
});
async function requireAction(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
) {
  const action = await tx.actionExecution.findUnique({
    where: { workspaceId_id: { workspaceId, id } },
  });
  if (!action) throw new AppException('RESOURCE_NOT_FOUND');
  return action;
}
@Injectable()
export class ActionService {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(ActionPolicy) private readonly policy: ActionPolicy,
  ) {}
  detail(actor: WorkspaceActor, id: string) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      return actionProjection(await requireAction(tx, actor.workspaceId, id));
    });
  }
  list(actor: WorkspaceActor, ticketId: string, query: PaginationQueryDto) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      await requireTicket(tx, actor.workspaceId, ticketId);
      const where = { workspaceId: actor.workspaceId, ticketId };
      return paginated(
        (
          await tx.actionExecution.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            ...paginationBounds(query),
          })
        ).map(actionProjection),
        await tx.actionExecution.count({ where }),
        query,
      );
    });
  }
  retry(
    actor: WorkspaceActor,
    id: string,
    input: z.input<typeof versionSchema>,
  ) {
    const body = parseContract(versionSchema, input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, admins);
      const action = await requireAction(tx, actor.workspaceId, id);
      if (
        action.version !== body.expectedVersion ||
        action.status !== 'FAILED' ||
        !action.retryable ||
        action.attempts >= 3
      )
        throw new AppException('INVALID_STATE_TRANSITION');
      const ticket = await requireTicket(
        tx,
        actor.workspaceId,
        action.ticketId,
      );
      if (ticket.status !== 'EXECUTION_FAILED')
        throw new AppException('INVALID_STATE_TRANSITION');
      await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: 'EXECUTING', version: { increment: 1 } },
      });
      await this.policy.validate(
        tx,
        actor.workspaceId,
        action.proposalId,
        'execute',
      );
      await tx.actionExecution.update({
        where: { id },
        data: {
          status: 'QUEUED',
          version: { increment: 1 },
          finishedAt: null,
          failureCode: null,
          retryable: false,
        },
      });
      await enqueueJob(tx, actor.workspaceId, 'action', id, actor.requestId);
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: ticket.id,
        eventType: 'action.retry_queued',
        metadata: { actionExecutionId: id },
      });
      return { actionExecutionId: id, status: 'QUEUED' };
    });
  }
  reconcile(
    actor: WorkspaceActor,
    id: string,
    input: z.input<typeof versionSchema>,
  ) {
    const body = parseContract(versionSchema, input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, admins);
      const action = await requireAction(tx, actor.workspaceId, id);
      if (
        action.version !== body.expectedVersion ||
        action.status !== 'OUTCOME_UNKNOWN'
      )
        throw new AppException('INVALID_STATE_TRANSITION');
      let currentState: Prisma.InputJsonValue | null = null;
      if (action.type === 'REFUND_DUPLICATE_PAYMENT') {
        const row = await tx.payment.findUnique({
          where: {
            workspaceId_id: {
              workspaceId: actor.workspaceId,
              id: action.targetId,
            },
          },
          select: paymentSelect,
        });
        if (row) currentState = paymentProjection(row);
      } else if (action.type === 'CANCEL_AT_PERIOD_END') {
        const row = await tx.subscription.findUnique({
          where: {
            workspaceId_id: {
              workspaceId: actor.workspaceId,
              id: action.targetId,
            },
          },
          select: subscriptionSelect,
        });
        if (row) currentState = subscriptionProjection(row);
      } else {
        const row = await tx.productAccess.findUnique({
          where: {
            workspaceId_id: {
              workspaceId: actor.workspaceId,
              id: action.targetId,
            },
          },
          select: accessSelect,
        });
        if (row) currentState = accessProjection(row);
      }
      // A matching target state alone does not prove which command caused it.
      // This build has no nontransactional provider side effects to reconcile.
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: action.ticketId,
        eventType: 'action.reconciliation_required',
        metadata: { actionExecutionId: id },
      });
      return {
        ...actionProjection(action),
        currentState,
        reconciliation: 'MANUAL_REVIEW_REQUIRED',
      };
    });
  }
}
