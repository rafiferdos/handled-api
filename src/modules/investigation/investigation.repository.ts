import { Inject, Injectable } from '@nestjs/common';
import type {
  Prisma,
  InvestigationRun,
  InvestigationStep,
} from '../../generated/prisma/client.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { rethrowDatabaseError } from '../../common/database/database-errors.js';
import { parseContract } from '../../common/validation/parse-contract.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import { investigationTransitions } from '../ai/contracts/workflow.contracts.js';
import { classificationSchema } from '../ai/contracts/proposal-output.schema.js';
import { requireTicket } from '../ticket/ticket.service.js';
import { writeAudit } from '../audit/audit-writer.js';
import {
  runInputSchema,
  runTransitionSchema,
  stepInputSchema,
  finishStepSchema,
} from './investigation.inputs.js';
import type {
  RunInput,
  RunTransition,
  StepInput,
  FinishStepInput,
} from './investigation.inputs.js';

const runProjection = (r: InvestigationRun) => ({
  id: r.id,
  workspaceId: r.workspaceId,
  ticketId: r.ticketId,
  parentRunId: r.parentRunId,
  status: r.status,
  provider: r.provider,
  model: r.model,
  promptVersion: r.promptVersion,
  classification: r.classification
    ? classificationSchema.parse(r.classification)
    : null,
  triggeredByUserId: r.triggeredByUserId,
  version: r.version,
  failureCode: r.failureCode,
  startedAt: r.startedAt?.toISOString() ?? null,
  finishedAt: r.finishedAt?.toISOString() ?? null,
  createdAt: r.createdAt.toISOString(),
});
const stepProjection = (s: InvestigationStep) => ({
  id: s.id,
  sequence: s.sequence,
  type: s.type,
  label: s.label,
  status: s.status,
  toolName: s.toolName,
  sourceRefs: s.sourceRefs,
  durationMs: s.durationMs,
  errorCode: s.errorCode,
});
export async function requireRun(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
) {
  const run = await tx.investigationRun.findUnique({
    where: { workspaceId_id: { workspaceId, id } },
  });
  if (!run) throw new AppException('RESOURCE_NOT_FOUND');
  return run;
}
@Injectable()
export class InvestigationRepository {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  async create(actor: WorkspaceActor, ticketId: string, input: RunInput) {
    try {
      return await this.uow.run((tx) =>
        this.createInTransaction(tx, actor, ticketId, input),
      );
    } catch (error) {
      rethrowDatabaseError(error);
    }
  }
  /** Future queue coordinator composes admission and outbox in its transaction. */
  async createInTransaction(
    tx: Prisma.TransactionClient,
    actor: WorkspaceActor,
    ticketId: string,
    input: RunInput,
  ) {
    const data = parseContract(runInputSchema, input);
    const member = await assertWorkspaceActor(tx, actor, WRITERS);
    const ticket = await requireTicket(tx, actor.workspaceId, ticketId);
    if (!['NEW', 'NEEDS_REVIEW', 'REJECTED', 'QUEUED'].includes(ticket.status))
      throw new AppException('INVALID_STATE_TRANSITION');
    if (data.parentRunId) {
      const parent = await requireRun(tx, actor.workspaceId, data.parentRunId);
      if (parent.ticketId !== ticket.id)
        throw new AppException('RESOURCE_NOT_FOUND');
      if (!['FAILED', 'NEEDS_REVIEW'].includes(parent.status))
        throw new AppException('INVALID_STATE_TRANSITION');
    }
    if (
      await tx.investigationRun.count({
        where: {
          workspaceId: actor.workspaceId,
          ticketId: ticket.id,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      })
    )
      throw new AppException('INVALID_STATE_TRANSITION');
    const run = await tx.investigationRun.create({
      data: {
        workspaceId: actor.workspaceId,
        ticketId: ticket.id,
        ...data,
        triggeredByUserId: actor.userId,
        triggeredByMembershipId: member.id,
        triggeredBySessionId: actor.sessionId,
        requestId: actor.requestId,
      },
    });
    await writeAudit(tx, actor, {
      entityType: 'investigation',
      entityId: run.id,
      eventType: 'investigation.created',
      metadata: { ticketId: ticket.id, parentRunId: run.parentRunId },
    });
    return runProjection(run);
  }
  read(actor: WorkspaceActor, id: string) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const run = await requireRun(tx, actor.workspaceId, id);
      const steps = await tx.investigationStep.findMany({
        where: { workspaceId: actor.workspaceId, investigationId: id },
        orderBy: { sequence: 'asc' },
        take: 100,
      });
      return { ...runProjection(run), steps: steps.map(stepProjection) };
    });
  }
  list(actor: WorkspaceActor, ticketId: string, query: PaginationQueryDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      await requireTicket(tx, actor.workspaceId, ticketId);
      const where = { workspaceId: actor.workspaceId, ticketId };
      return paginated(
        (
          await tx.investigationRun.findMany({
            where,
            orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
            ...paginationBounds(query),
          })
        ).map(runProjection),
        await tx.investigationRun.count({ where }),
        query,
      );
    });
  }
  transition(actor: WorkspaceActor, id: string, input: RunTransition) {
    const data = parseContract(runTransitionSchema, input);
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      const run = await requireRun(tx, actor.workspaceId, id);
      const allowed: readonly string[] = investigationTransitions[run.status];
      if (
        run.version !== data.expectedVersion ||
        !allowed.includes(data.status)
      )
        throw new AppException('INVALID_STATE_TRANSITION');
      const now = new Date();
      const result = await tx.investigationRun.updateMany({
        where: {
          workspaceId: actor.workspaceId,
          id,
          version: data.expectedVersion,
          status: run.status,
        },
        data: {
          status: data.status,
          version: { increment: 1 },
          ...(data.status === 'RUNNING'
            ? { startedAt: now }
            : { finishedAt: now }),
          ...(data.classification
            ? { classification: data.classification }
            : {}),
          failureCode: data.failureCode,
        },
      });
      if (!result.count) throw new AppException('INVALID_STATE_TRANSITION');
      await writeAudit(tx, actor, {
        entityType: 'investigation',
        entityId: id,
        eventType: 'investigation.transitioned',
        metadata: { status: data.status },
      });
      return runProjection(await requireRun(tx, actor.workspaceId, id));
    });
  }
  async recordStep(actor: WorkspaceActor, id: string, input: StepInput) {
    const data = parseContract(stepInputSchema, input);
    try {
      return await this.uow.run(async (tx) => {
        await assertWorkspaceActor(tx, actor, WRITERS);
        const run = await requireRun(tx, actor.workspaceId, id);
        if (run.status !== 'RUNNING')
          throw new AppException('INVALID_STATE_TRANSITION');
        if (
          (await tx.investigationStep.count({
            where: { workspaceId: actor.workspaceId, investigationId: id },
          })) >= 100
        )
          throw new AppException('BUSINESS_RULE_FAILED');
        return stepProjection(
          await tx.investigationStep.create({
            data: {
              ...data,
              workspaceId: actor.workspaceId,
              investigationId: id,
            },
          }),
        );
      });
    } catch (error) {
      rethrowDatabaseError(error);
    }
  }
  finishStep(
    actor: WorkspaceActor,
    id: string,
    sequence: number,
    input: FinishStepInput,
  ) {
    const data = parseContract(finishStepSchema, input);
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      const run = await requireRun(tx, actor.workspaceId, id);
      if (run.status !== 'RUNNING')
        throw new AppException('INVALID_STATE_TRANSITION');
      const result = await tx.investigationStep.updateMany({
        where: {
          workspaceId: actor.workspaceId,
          investigationId: id,
          sequence,
          status: 'RUNNING',
        },
        data,
      });
      if (!result.count) throw new AppException('INVALID_STATE_TRANSITION');
      return stepProjection(
        await tx.investigationStep.findUniqueOrThrow({
          where: {
            workspaceId_investigationId_sequence: {
              workspaceId: actor.workspaceId,
              investigationId: id,
              sequence,
            },
          },
        }),
      );
    });
  }
  retry(
    actor: WorkspaceActor,
    id: string,
    input: Omit<RunInput, 'parentRunId'>,
  ) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      const run = await requireRun(tx, actor.workspaceId, id);
      return this.createInTransaction(tx, actor, run.ticketId, {
        ...input,
        parentRunId: run.id,
      });
    });
  }
}
