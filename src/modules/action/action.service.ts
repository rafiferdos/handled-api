import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client.js';
import {
  ActionExecutionStatus,
  ActionType,
  AuditSource,
  AuditSubjectType,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AuditService } from '../audit/audit.service.js';
import {
  QueueName,
  SupportEvent,
} from '../../common/contracts/async.contracts.js';
import { ActionExecutionResponseDto } from './dto/action-execution-response.dto.js';

/** Exponential backoff base delay (ms) for the simulated action handler. */
const ACTION_QUEUE_BACKOFF_MS = 1_000;

/** Hard cap on retries. Stays in lockstep with `JobOptions.attempts` below. */
const ACTION_QUEUE_ATTEMPTS = 3;

export interface QueueApprovedActionResult {
  actionExecutionId: string;
  status: ActionExecutionStatus;
  duplicate: boolean;
}


export interface QueueApprovedActionParams {
  workspaceId: string;
  proposalId: string;
  decisionId: string;
  actionType: ActionType;
  idempotencyKey: string;
  targetRef: string;
  targetId: string;
  proposalVersion: number;
  targetStateVersion: number;
  input: Record<string, unknown> | null;
  /** Resolved actor (Profile id) from the access context, or null for system. */
  actorId: string | null;
}

@Injectable()
export class ActionService {
  private readonly logger = new Logger(ActionService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly auditService: AuditService,
    @InjectQueue(QueueName.ACTION)
    private readonly actionQueue: Queue,
  ) {}


  async queueApprovedAction(
    params: QueueApprovedActionParams,
  ): Promise<QueueApprovedActionResult> {
    const businessEffectKey = this.buildBusinessEffectKey(params);


    const existing = await this.prisma.actionExecution.findUnique({
      where: {
        action_execution_business_effect_unique: {
          workspaceId: params.workspaceId,
          businessEffectKey,
        },
      },
      select: { id: true, status: true },
    });
    if (existing) {
      return {
        actionExecutionId: existing.id,
        status: existing.status,
        duplicate: true,
      };
    }

    const payload = this.buildPayload(params);
    const execution = await this.prisma.$transaction(async (tx) => {
      const created = await tx.actionExecution.create({
        data: {
          workspaceId: params.workspaceId,
          actionType: params.actionType,
          status: ActionExecutionStatus.QUEUED,
          businessEffectKey,
          idempotencyKey: params.idempotencyKey,
          proposalId: params.proposalId,
          customerId: null,
          requestedBy: params.actorId ?? params.proposalId,
          approvedBy: params.actorId,
          payload: payload as Prisma.InputJsonValue,
        },
      });

      await this.auditService.recordEvent(tx, {
        workspaceId: params.workspaceId,
        subjectType: AuditSubjectType.ACTION_EXECUTION,
        subjectId: created.id,
        action: 'ACTION_QUEUED',
        actorId: params.actorId ?? undefined,
        source: AuditSource.API,
        businessEffectKey,
        idempotencyKey: params.idempotencyKey,
        metadata: {
          proposalId: params.proposalId,
          decisionId: params.decisionId,
          actionType: params.actionType,
        },
      });

      await tx.outboxEvent.create({
        data: {
          workspaceId: params.workspaceId,
          businessEffectKey,
          eventName: SupportEvent.ACTION_EXECUTE,
          payload: {
            workspaceId: params.workspaceId,
            actionExecutionId: created.id,
            status: ActionExecutionStatus.QUEUED,
            changedAt: new Date().toISOString(),
          } as Prisma.InputJsonValue,
        },
      });

      return created;
    });


    try {
      await this.actionQueue.add(
        QueueName.ACTION,
        {
          workspaceId: execution.workspaceId,
          actionExecutionId: execution.id,
        },
        {
          jobId: `action-${execution.id}`,
          attempts: ACTION_QUEUE_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: ACTION_QUEUE_BACKOFF_MS,
          },
          removeOnComplete: { age: 24 * 3600, count: 1000 },
          removeOnFail: { age: 7 * 24 * 3600 },
        },
      );
    } catch (err) {
      this.logger.error(
        `Failed to enqueue BullMQ job for actionExecution=${execution.id} workspace=${execution.workspaceId}`,
        err instanceof Error ? err.stack : String(err),
      );

      throw new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE);
    }

    return {
      actionExecutionId: execution.id,
      status: execution.status,
      duplicate: false,
    };
  }


  async getActionsByTicket(
    workspaceId: string,
    ticketId: string,
  ): Promise<ActionExecutionResponseDto[]> {
    const rows = await this.prisma.actionExecution.findMany({
      where: { workspaceId, ticketId },
      orderBy: { queuedAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getActionById(
    workspaceId: string,
    actionId: string,
  ): Promise<ActionExecutionResponseDto> {
    const row = await this.prisma.actionExecution.findFirst({
      where: { id: actionId, workspaceId },
    });
    if (!row) {
      throw new AppException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    return this.toResponse(row);
  }


  private buildBusinessEffectKey(params: QueueApprovedActionParams): string {
    return [
      'action',
      params.proposalId,
      params.decisionId,
      params.targetRef,
      params.targetId,
      String(params.proposalVersion),
      String(params.targetStateVersion),
    ].join(':');
  }

  private buildPayload(
    params: QueueApprovedActionParams,
  ): Record<string, unknown> {
    return {
      proposalId: params.proposalId,
      decisionId: params.decisionId,
      targetRef: params.targetRef,
      targetId: params.targetId,
      proposalVersion: params.proposalVersion,
      targetStateVersion: params.targetStateVersion,
      input: params.input ?? null,
    };
  }

  private toResponse(row: {
    id: string;
    workspaceId: string;
    actionType: ActionType;
    status: ActionExecutionStatus;
    businessEffectKey: string;
    idempotencyKey: string;
    ticketId: string | null;
    proposalId: string | null;
    customerId: string | null;
    requestedBy: string;
    approvedBy: string | null;
    payload: Prisma.JsonValue;
    lastErrorCode: string | null;
    queuedAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }): ActionExecutionResponseDto {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      actionType: row.actionType,
      status: row.status,
      businessEffectKey: row.businessEffectKey,
      idempotencyKey: row.idempotencyKey,
      ticketId: row.ticketId,
      proposalId: row.proposalId,
      customerId: row.customerId,
      requestedBy: row.requestedBy,
      approvedBy: row.approvedBy,
      payload: (row.payload ?? {}) as Record<string, unknown>,
      lastErrorCode: row.lastErrorCode,
      queuedAt: row.queuedAt.toISOString(),
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      finishedAt: row.finishedAt ? row.finishedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }


  async retryFailedAction(
    workspaceId: string,
    actionId: string,
    _actorId: string | null,
  ): Promise<ActionExecutionResponseDto> {
    const existing = await this.prisma.actionExecution.findFirst({
      where: { id: actionId, workspaceId },
    });
    if (!existing) {
      throw new AppException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    throw new AppException(ErrorCode.INVALID_STATE_TRANSITION);
  }

  async reconcileAction(
    workspaceId: string,
    actionId: string,
    _actorId: string | null,
  ): Promise<ActionExecutionResponseDto> {
    const existing = await this.prisma.actionExecution.findFirst({
      where: { id: actionId, workspaceId },
    });
    if (!existing) {
      throw new AppException(ErrorCode.RESOURCE_NOT_FOUND);
    }
    throw new AppException(ErrorCode.INVALID_STATE_TRANSITION);
  }
}
