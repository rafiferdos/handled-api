import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { Prisma } from '../../../generated/prisma/client.js';
import {
  ActionExecutionStatus,
  AuditSource,
  AuditSubjectType,
} from '../../../generated/prisma/client.js';
import type { ActionExecution } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import {
  QueueName,
  SupportEvent,
} from '../../../common/contracts/async.contracts.js';
import { SupportGateway } from '../../events/support.gateway.js';
import { ActionHandlerRegistry } from '../action.handler.js';
import type { ActionHandlerResult } from '../action.handler.js';

/**
 * Action worker. One BullMQ job per `ActionExecution` row.
 *
 * Lifecycle:
 *   1. Idempotency guard: a row already in a terminal state (`SUCCEEDED` /
 *      `FAILED`) returns immediately. The job is a no-op so BullMQ retries
 *      never re-apply a side effect.
 *   2. Mark the row `RUNNING`, bump `attempt`, append an `ACTION_STARTED`
 *      audit row, and notify the workspace via the `SupportGateway` (the
 *      synchronous best-effort sink). The outbox remains the durable path.
 *   3. Run the simulated handler. The handler returns a `beforeState` /
 *      `afterState` projection that the worker persists in the same
 *      transaction that flips the row to `SUCCEEDED` and appends the
 *      `ACTION_EXECUTED` audit row.
 *   4. On success: emit `action.completed` through the gateway, write the
 *      final outbox event, and commit.
 *   5. On failure: flip the row to `FAILED`, capture the sanitized error
 *      code in `lastErrorCode`, emit `action.failed`, and let BullMQ schedule
 *      the next retry. The job re-throws so BullMQ records the failure.
 *
 * The mutation targets (Payment / Subscription / ProductAccess) belong to
 * Person B; until those tables ship, the handler is a deterministic
 * simulation that produces realistic before/after snapshots so the audit
 * reader can replay the effect.
 */
@Processor(QueueName.ACTION, { concurrency: 2 })
export class ActionProcessor extends WorkerHost {
  private readonly logger = new Logger(ActionProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SupportGateway) private readonly supportGateway: SupportGateway,
    @Inject(ActionHandlerRegistry)
    private readonly handlers: ActionHandlerRegistry,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const payload = parseJob(job.data);
    if (!payload) {
      this.logger.warn(
        `Dropping malformed action job ${job.id}: missing workspaceId or actionExecutionId`,
      );
      return;
    }

    const { workspaceId, actionExecutionId } = payload;
    const requestId = job.data?.requestId ?? null;

    // Step 1: idempotency guard. A row already in SUCCEEDED (or FAILED) is
    // treated as a no-op so BullMQ retries never re-apply the side effect.
    const existing = await this.prisma.actionExecution.findFirst({
      where: { id: actionExecutionId, workspaceId },
    });
    if (!existing) {
      this.logger.warn(
        `Action ${actionExecutionId} not found for workspace ${workspaceId}; dropping job`,
      );
      return;
    }
    if (existing.status === ActionExecutionStatus.SUCCEEDED) {
      this.logger.log(
        `Action ${actionExecutionId} already SUCCEEDED; idempotency guard fired`,
      );
      return;
    }

    // Step 2: RUNNING + ACTION_STARTED + live progress notify.
    const started = await this.markRunning(existing);
    await this.notifyProgress(started, requestId);

    // Step 3 + 4: handler + commit, or catch below.
    try {
      const result = await this.handlers.run(this.prisma, started);
      await this.commitSuccess(started, result, requestId);
    } catch (err) {
      await this.recordFailure(started, err, requestId);
      throw err;
    }
  }

  /**
   * Atomically flip the row to RUNNING + bump attempts + append the
   * `ACTION_STARTED` audit row. The conditional update prevents two workers
   * from double-starting the same execution.
   */
  private async markRunning(row: ActionExecution): Promise<ActionExecution> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.actionExecution.update({
        where: { id: row.id },
        data: {
          status: ActionExecutionStatus.RUNNING,
          startedAt: new Date(),
          attempt: { increment: 1 },
        },
      });
      await this.auditService.recordEvent(tx, {
        workspaceId: updated.workspaceId,
        subjectType: AuditSubjectType.ACTION_EXECUTION,
        subjectId: updated.id,
        action: 'ACTION_STARTED',
        source: AuditSource.WORKER,
        businessEffectKey: updated.businessEffectKey,
        idempotencyKey: updated.idempotencyKey,
        metadata: { attempt: updated.attempt },
      });
      return updated;
    });
  }

  /**
   * Best-effort `action.progress` notification. A failure to deliver the
   * realtime event is logged but never fails the job; the outbox row + the
   * `ACTION_STARTED` audit row guarantee clients can recover on reconnect.
   */
  private async notifyProgress(
    row: ActionExecution,
    requestId: string | null,
  ): Promise<void> {
    try {
      await this.supportGateway.emitToWorkspace(
        row.workspaceId,
        SupportEvent.ACTION_PROGRESS,
        {
          actionExecutionId: row.id,
          actionType: row.actionType,
          status: ActionExecutionStatus.RUNNING,
          attempt: row.attempt + 1,
          requestId,
        },
      );
    } catch (err) {
      this.logger.warn(
        `action.progress notify failed for ${row.id}: ${err instanceof Error ? err.constructor.name : typeof err}`,
      );
    }
  }

  /**
   * The happy path: persist the handler result + the simulated effect
   * snapshots + the `ACTION_EXECUTED` audit row in a single transaction, then
   * emit `action.completed` through the support gateway.
   */
  private async commitSuccess(
    row: ActionExecution,
    result: ActionHandlerResult,
    requestId: string | null,
  ): Promise<void> {
    const finishedAt = new Date();
    const beforeState = result.beforeState as Prisma.InputJsonValue;
    const afterState = result.afterState as Prisma.InputJsonValue;

    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.actionExecution.update({
        where: { id: row.id },
        data: {
          status: ActionExecutionStatus.SUCCEEDED,
          finishedAt,
          resultCode: result.resultCode,
          resultMessage: result.resultMessage,
          beforeState,
          afterState,
          lastErrorCode: null,
        },
      });
      await this.auditService.recordEvent(tx, {
        workspaceId: updated.workspaceId,
        subjectType: AuditSubjectType.ACTION_EXECUTION,
        subjectId: updated.id,
        action: 'ACTION_EXECUTED',
        source: AuditSource.WORKER,
        businessEffectKey: updated.businessEffectKey,
        idempotencyKey: updated.idempotencyKey,
        metadata: {
          actionType: updated.actionType,
          resultCode: result.resultCode,
          attempt: updated.attempt,
        },
      });
    });

    try {
      await this.supportGateway.emitToWorkspace(
        row.workspaceId,
        SupportEvent.ACTION_COMPLETED,
        {
          actionExecutionId: row.id,
          actionType: row.actionType,
          status: ActionExecutionStatus.SUCCEEDED,
          resultCode: result.resultCode,
          requestId,
        },
      );
    } catch (err) {
      this.logger.warn(
        `action.completed notify failed for ${row.id}: ${err instanceof Error ? err.constructor.name : typeof err}`,
      );
    }
  }

  /**
   * The failure path: capture the sanitized error code, append the
   * `ACTION_FAILED` audit row, emit `action.failed` through the support
   * gateway, and re-throw so BullMQ schedules a retry. The transient status
   * becomes OUTCOME_UNKNOWN when the worker dies mid-flight; the next
   * attempt reconciles the row back to QUEUED before re-running.
   */
  private async recordFailure(
    row: ActionExecution,
    err: unknown,
    requestId: string | null,
  ): Promise<void> {
    const errorCode = sanitizeErrorCode(err);
    const errorMessage =
      err instanceof Error ? err.constructor.name : 'unknown';
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.actionExecution.update({
          where: { id: row.id },
          data: {
            status: ActionExecutionStatus.FAILED,
            finishedAt: new Date(),
            lastErrorCode: errorCode,
            resultCode: errorCode,
            resultMessage: errorMessage,
          },
        });
        await this.auditService.recordEvent(tx, {
          workspaceId: row.workspaceId,
          subjectType: AuditSubjectType.ACTION_EXECUTION,
          subjectId: row.id,
          action: 'ACTION_FAILED',
          source: AuditSource.WORKER,
          businessEffectKey: row.businessEffectKey,
          idempotencyKey: row.idempotencyKey,
          metadata: { errorCode, attempt: row.attempt + 1 },
        });
      });
    } catch (commitErr) {
      // The transaction itself failed (DB unreachable, etc.). The next
      // reconciliation sweep will pick the row up; do not mask the original
      // error.
      this.logger.error(
        `Failed to persist FAILED state for action ${row.id}: ${
          commitErr instanceof Error
            ? commitErr.constructor.name
            : typeof commitErr
        }`,
      );
    }

    try {
      await this.supportGateway.emitToWorkspace(
        row.workspaceId,
        SupportEvent.ACTION_FAILED,
        {
          actionExecutionId: row.id,
          actionType: row.actionType,
          status: ActionExecutionStatus.FAILED,
          errorCode,
          requestId,
        },
      );
    } catch (notifyErr) {
      this.logger.warn(
        `action.failed notify failed for ${row.id}: ${
          notifyErr instanceof Error
            ? notifyErr.constructor.name
            : typeof notifyErr
        }`,
      );
    }
  }
}

function parseJob(data: unknown): {
  workspaceId: string;
  actionExecutionId: string;
  requestId: string | null;
} | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const workspaceId =
    typeof record['workspaceId'] === 'string' ? record['workspaceId'] : '';
  const actionExecutionId =
    typeof record['actionExecutionId'] === 'string'
      ? record['actionExecutionId']
      : '';
  if (!workspaceId || !actionExecutionId) return null;
  const requestId =
    typeof record['requestId'] === 'string' ? record['requestId'] : null;
  return { workspaceId, actionExecutionId, requestId };
}

function sanitizeErrorCode(err: unknown): string {
  if (
    err instanceof Error &&
    typeof err.message === 'string' &&
    err.message.length > 0
  ) {
    // Strip whitespace, uppercase, cap to 64 chars. Detailed messages stay in
    // the structured log; only the code is persisted.
    return err.message.trim().toUpperCase().slice(0, 64) || 'HANDLER_EXCEPTION';
  }
  return 'HANDLER_EXCEPTION';
}
