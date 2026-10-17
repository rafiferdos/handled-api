import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import { jobActor } from '../../common/database/job-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ActionPolicy } from './action-policy.js';
import { JobRegistry } from '../queue/outbox-dispatcher.js';
import type { JobExecution } from '../queue/outbox-dispatcher.js';
import {
  paymentProjection,
  paymentSelect,
  subscriptionProjection,
  subscriptionSelect,
  accessProjection,
  accessSelect,
} from '../billing/account-projections.js';
@Injectable()
export class ActionProcessor implements OnModuleInit {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(ActionPolicy) private readonly policy: ActionPolicy,
    @Inject(JobRegistry) private readonly registry: JobRegistry,
  ) {}
  onModuleInit() {
    this.registry.register('action', (job) => this.process(job));
  }
  private async process(job: JobExecution) {
    const seed = await this.uow.run((tx) =>
      tx.actionExecution.findUnique({
        where: {
          workspaceId_id: { workspaceId: job.workspaceId, id: job.aggregateId },
        },
        include: { decision: true },
      }),
    );
    if (!seed || !['QUEUED', 'RUNNING'].includes(seed.status)) return;
    const actor = jobActor(
      job.workspaceId,
      seed.decision.actorUserId,
      seed.decision.actorSessionId,
      job.requestId,
    );
    try {
      await this.uow.runAs(actor, async (tx) => {
        await assertWorkspaceActor(tx, actor, WRITERS);
        await job.assertCurrent(tx);
        const action = await tx.actionExecution.findUniqueOrThrow({
          where: {
            workspaceId_id: {
              workspaceId: job.workspaceId,
              id: job.aggregateId,
            },
          },
          include: { decision: true },
        });
        if (!['QUEUED', 'RUNNING'].includes(action.status)) {
          await job.complete(tx);
          return;
        }
        if (
          action.decision.kind !== 'APPROVED' ||
          action.decision.proposalId !== action.proposalId ||
          action.decision.proposalVersion !== action.proposalVersion
        )
          throw new AppException('BUSINESS_RULE_FAILED');
        const eligible = await this.policy.validate(
          tx,
          job.workspaceId,
          action.proposalId,
          'execute',
        );
        if (
          action.targetId !== eligible.targetId ||
          action.type !== eligible.type ||
          action.targetRef !== eligible.targetRef
        )
          throw new AppException('BUSINESS_RULE_FAILED');
        await tx.actionExecution.update({
          where: { id: action.id },
          data: {
            status: 'RUNNING',
            attempts: { increment: 1 },
            version: { increment: 1 },
          },
        });
        let afterState: typeof eligible.beforeState;
        if (eligible.type === 'REFUND_DUPLICATE_PAYMENT') {
          const result = await tx.payment.updateMany({
            where: {
              workspaceId: job.workspaceId,
              id: eligible.targetId,
              version: eligible.target.version,
              status: 'SETTLED',
            },
            data: {
              status: 'REFUNDED',
              refundedAt: new Date(),
              version: { increment: 1 },
            },
          });
          if (!result.count) throw new AppException('BUSINESS_RULE_FAILED');
          afterState = paymentProjection(
            await tx.payment.findUniqueOrThrow({
              where: {
                workspaceId_id: {
                  workspaceId: job.workspaceId,
                  id: eligible.targetId,
                },
              },
              select: paymentSelect,
            }),
          );
        } else if (eligible.type === 'CANCEL_AT_PERIOD_END') {
          const result = await tx.subscription.updateMany({
            where: {
              workspaceId: job.workspaceId,
              id: eligible.targetId,
              version: eligible.target.version,
              status: 'ACTIVE',
              cancelAtPeriodEnd: false,
            },
            data: { cancelAtPeriodEnd: true, version: { increment: 1 } },
          });
          if (!result.count) throw new AppException('BUSINESS_RULE_FAILED');
          afterState = subscriptionProjection(
            await tx.subscription.findUniqueOrThrow({
              where: {
                workspaceId_id: {
                  workspaceId: job.workspaceId,
                  id: eligible.targetId,
                },
              },
              select: subscriptionSelect,
            }),
          );
        } else {
          const result = await tx.productAccess.updateMany({
            where: {
              workspaceId: job.workspaceId,
              id: eligible.targetId,
              version: eligible.target.version,
              status: { in: ['REVOKED', 'PENDING'] },
            },
            data: {
              status: 'ACTIVE',
              reason: 'HUMAN_APPROVED_SIMULATION',
              lastSyncedAt: new Date(),
              version: { increment: 1 },
            },
          });
          if (!result.count) throw new AppException('BUSINESS_RULE_FAILED');
          afterState = accessProjection(
            await tx.productAccess.findUniqueOrThrow({
              where: {
                workspaceId_id: {
                  workspaceId: job.workspaceId,
                  id: eligible.targetId,
                },
              },
              select: accessSelect,
            }),
          );
        }
        await tx.actionExecution.update({
          where: { id: action.id },
          data: {
            status: 'SUCCEEDED',
            beforeState: eligible.beforeState,
            afterState,
            failureCode: null,
            retryable: false,
            finishedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await tx.ticket.update({
          where: { id: action.ticketId },
          data: { status: 'RESOLVED', version: { increment: 1 } },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: job.workspaceId,
            entityType: 'ticket',
            entityId: action.ticketId,
            eventType: 'action.completed',
            actorType: 'SYSTEM',
            requestId: job.requestId,
            metadata: {
              actionExecutionId: action.id,
              proposalId: action.proposalId,
              decisionId: action.decisionId,
              approvedBy: action.decision.actorUserId,
              simulation: true,
              type: action.type,
            },
          },
        });
        await job.complete(tx);
      });
    } catch (error) {
      await this.uow.run(async (tx) => {
        await tx.$queryRaw`SELECT id FROM handled."Workspace" WHERE id=${job.workspaceId}::uuid FOR UPDATE`;
        await job.assertCurrent(tx);
        const action = await tx.actionExecution.findUnique({
          where: {
            workspaceId_id: {
              workspaceId: job.workspaceId,
              id: job.aggregateId,
            },
          },
        });
        if (!action || !['QUEUED', 'RUNNING'].includes(action.status)) {
          await job.complete(tx);
          return;
        }
        const code =
          error instanceof AppException ? error.code : 'DEPENDENCY_UNAVAILABLE';
        await tx.actionExecution.update({
          where: { id: action.id },
          data: {
            status: 'FAILED',
            failureCode: code,
            retryable: [
              'DEPENDENCY_TIMEOUT',
              'DEPENDENCY_UNAVAILABLE',
            ].includes(code),
            attempts: { increment: 1 },
            version: { increment: 1 },
            finishedAt: new Date(),
          },
        });
        await tx.ticket.updateMany({
          where: {
            workspaceId: job.workspaceId,
            id: action.ticketId,
            status: 'EXECUTING',
          },
          data: { status: 'EXECUTION_FAILED', version: { increment: 1 } },
        });
        await tx.auditEvent.create({
          data: {
            workspaceId: job.workspaceId,
            entityType: 'ticket',
            entityId: action.ticketId,
            eventType: 'action.failed',
            actorType: 'SYSTEM',
            requestId: job.requestId,
            metadata: {
              actionExecutionId: action.id,
              errorCode: code,
              simulation: true,
            },
          },
        });
        await job.complete(tx);
      });
    }
  }
}
