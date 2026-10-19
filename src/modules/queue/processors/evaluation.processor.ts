import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  AuditSource,
  AuditSubjectType,
  EvaluationRunStatus,
} from '../../../generated/prisma/client.js';
import type {
  EvaluationRun,
  Prisma,
} from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { SupportGateway } from '../../events/support.gateway.js';
import { QueueName } from '../../../common/contracts/async.contracts.js';
import type { EvaluationJob } from '../../../common/contracts/async.contracts.js';

const CONCURRENCY = 2;

/**
 * Evaluation worker (Person D / processing). One BullMQ job per
 * `EvaluationRun` row.
 *
 * The lead owns the evaluation scoring/schema; this processor owns the
 * queue-side lifecycle:
 *   1. Idempotency guard: rows in a terminal state (`COMPLETED` / `FAILED`)
 *      are a no-op so BullMQ retries never double-count a run.
 *   2. Mark the row `RUNNING` + bump `attempt` in one transaction with the
 *      `EVALUATION_STARTED` audit row, and notify the workspace via the
 *      `SupportGateway` so the dashboard gets a live status.
 *   3. Run the lead-owned scoring through a thin seam. The MVP returns
 *      immediately with a stub result; the lead plugs in real scoring by
 *      replacing `runScoring` (see ADR-005). The seam is intentionally
 *      synchronous + pure so retries are deterministic.
 *   4. On success: `COMPLETED` + `EVALUATION_COMPLETED` audit + outbox
 *      `PUBLISHED` (already published by the dispatcher) + live notify.
 *   5. On failure: `FAILED` + sanitized `lastErrorCode` + notify, then
 *      re-throw so BullMQ schedules the next retry.
 */
@Processor(QueueName.EVALUATION, { concurrency: CONCURRENCY })
export class EvaluationProcessor extends WorkerHost {
  private readonly logger = new Logger(EvaluationProcessor.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(SupportGateway) private readonly supportGateway: SupportGateway,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    const payload = parseJob(job.data);
    if (!payload) {
      this.logger.warn(
        `Dropping malformed evaluation job ${job.id}: missing workspaceId or runId`,
      );
      return;
    }
    const { workspaceId, runId } = payload;
    const requestId = job.data?.requestId ?? null;

    // Step 1: idempotency guard. A row already in a terminal state is
    // treated as a no-op so BullMQ retries never re-run scoring.
    const existing = await this.prisma.evaluationRun.findFirst({
      where: { id: runId, workspaceId },
    });
    if (!existing) {
      this.logger.warn(
        `EvaluationRun ${runId} not found for workspace ${workspaceId}; dropping job`,
      );
      return;
    }
    if (isTerminal(existing.status)) {
      this.logger.log(
        `EvaluationRun ${runId} already ${existing.status}; idempotency guard fired`,
      );
      return;
    }

    // Step 2: RUNNING + audit + live notify.
    const running = await this.markRunning(existing);
    await this.notifyProgress(running, requestId);

    // Step 3 + 4: scoring + commit, or catch below.
    try {
      const summary = await this.runScoring(running);
      await this.commitSuccess(running, summary, requestId);
    } catch (err) {
      await this.commitFailure(running, err, requestId);
      // Re-throw so BullMQ records the failure and applies the configured
      // backoff. The row is already in FAILED; the next retry is a no-op
      // because of the idempotency guard above.
      throw err;
    }
  }

  /**
   * Mark the row RUNNING + bump `attempt` + append the
   * `EVALUATION_STARTED` audit row. All three writes happen in a single
   * transaction so the audit chain stays consistent with the run state.
   */
  private async markRunning(run: EvaluationRun): Promise<EvaluationRun> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.evaluationRun.update({
        where: { id: run.id },
        data: {
          status: EvaluationRunStatus.RUNNING,
          startedAt: new Date(),
          attempt: { increment: 1 },
        },
      });
      await this.auditService.recordEvent(tx, {
        workspaceId: updated.workspaceId,
        subjectType: AuditSubjectType.WORKSPACE,
        subjectId: updated.workspaceId,
        action: 'EVALUATION_STARTED',
        source: AuditSource.WORKER,
        // The businessEffectKey is the runId itself; evaluations do not
        // share effects with other modules.
        businessEffectKey: updated.id,
        idempotencyKey: updated.id,
        metadata: {
          runId: updated.id,
          attempt: updated.attempt,
        },
      });
      return updated;
    });
  }

  /**
   * Stub scoring. The lead replaces this with the real case runner; for
   * now we record a deterministic summary so the audit chain + dashboard
   * get realistic data. The function MUST stay pure (no I/O, no clock
   * drift) so retries are safe.
   */
  private async runScoring(
    run: EvaluationRun,
  ): Promise<{ casesScored: number; averageScore: number }> {
    void run;
    return { casesScored: 0, averageScore: 0 };
  }

  /**
   * Final transaction for the success path. The row goes COMPLETED, the
   * `EVALUATION_COMPLETED` audit row is appended in the same transaction,
   * and a thin notification goes out through the support gateway.
   */
  private async commitSuccess(
    run: EvaluationRun,
    summary: { casesScored: number; averageScore: number },
    requestId: string | null,
  ): Promise<void> {
    const finishedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.evaluationRun.update({
        where: { id: run.id },
        data: {
          status: EvaluationRunStatus.COMPLETED,
          finishedAt,
        },
      });
      await this.auditService.recordEvent(tx, {
        workspaceId: run.workspaceId,
        subjectType: AuditSubjectType.WORKSPACE,
        subjectId: run.workspaceId,
        action: 'EVALUATION_COMPLETED',
        source: AuditSource.WORKER,
        businessEffectKey: run.id,
        idempotencyKey: run.id,
        metadata: {
          runId: run.id,
          requestId,
          casesScored: summary.casesScored,
          averageScore: summary.averageScore,
        },
      });
    });
    await this.notifyCompleted(run.workspaceId, run.id, summary, requestId);
  }

  /**
   * Final transaction for the failure path. The row goes FAILED, the
   * sanitized `lastErrorCode` is captured, the `EVALUATION_FAILED` audit
   * row is appended, and a `evaluation.failed` notification goes out. The
   * processor then re-throws so BullMQ records the failure.
   */
  private async commitFailure(
    run: EvaluationRun,
    err: unknown,
    requestId: string | null,
  ): Promise<void> {
    const code = errorCode(err);
    const message = errorMessage(err);
    const finishedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.evaluationRun.update({
        where: { id: run.id },
        data: {
          status: EvaluationRunStatus.FAILED,
          finishedAt,
          lastErrorCode: code,
        },
      });
      await this.auditService.recordEvent(tx, {
        workspaceId: run.workspaceId,
        subjectType: AuditSubjectType.WORKSPACE,
        subjectId: run.workspaceId,
        action: 'EVALUATION_FAILED',
        source: AuditSource.WORKER,
        businessEffectKey: run.id,
        idempotencyKey: run.id,
        metadata: {
          runId: run.id,
          requestId,
          lastErrorCode: code,
          // lastErrorMessage stays in the structured log; never persisted.
        },
      });
    });
    this.logger.warn(
      `EvaluationRun ${run.id} FAILED (code=${code}, message=${message})`,
    );
    await this.supportGateway.emitToWorkspace(
      run.workspaceId,
      'evaluation.failed',
      {
        runId: run.id,
        status: EvaluationRunStatus.FAILED,
        lastErrorCode: code,
        requestId: requestId ?? undefined,
      },
    );
  }

  private async notifyProgress(
    run: EvaluationRun,
    requestId: string | null,
  ): Promise<void> {
    await this.supportGateway.emitToWorkspace(
      run.workspaceId,
      'evaluation.started',
      {
        runId: run.id,
        status: EvaluationRunStatus.RUNNING,
        attempt: run.attempt,
        requestId: requestId ?? undefined,
      },
    );
  }

  private async notifyCompleted(
    workspaceId: string,
    runId: string,
    summary: { casesScored: number; averageScore: number },
    requestId: string | null,
  ): Promise<void> {
    await this.supportGateway.emitToWorkspace(
      workspaceId,
      'evaluation.completed',
      {
        runId,
        status: EvaluationRunStatus.COMPLETED,
        casesScored: summary.casesScored,
        averageScore: summary.averageScore,
        requestId: requestId ?? undefined,
      },
    );
  }
}

function isTerminal(status: EvaluationRunStatus): boolean {
  return (
    status === EvaluationRunStatus.COMPLETED ||
    status === EvaluationRunStatus.FAILED
  );
}

function parseJob(data: unknown): (EvaluationJob & { runId: string }) | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  const workspaceId = record['workspaceId'];
  const runId = record['runId'];
  if (typeof workspaceId !== 'string' || typeof runId !== 'string') {
    return null;
  }
  // requestId is optional on the wire (see JobContext); default to the runId
  // so audit metadata always has a correlation token.
  const requestId =
    typeof record['requestId'] === 'string'
      ? (record['requestId'] as string)
      : runId;
  return { workspaceId, requestId, runId };
}

function errorCode(err: unknown): string {
  if (err && typeof err === 'object' && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && code.length > 0) return code;
  }
  if (err instanceof Error) {
    return err.constructor.name.replace(/Error$/, '').toUpperCase() || 'ERROR';
  }
  return 'EVALUATION_EXCEPTION';
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 256);
  return typeof err === 'string' ? err.slice(0, 256) : 'unknown';
}

// Silence unused-import warnings for types used in JSDoc only.
type _Unused = Prisma.JsonValue;
