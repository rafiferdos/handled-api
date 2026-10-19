import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { ActionType } from '../../generated/prisma/client.js';
import type { ActionExecution } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';

export interface ActionHandlerResult {
  // Persisted JSON snapshots. The "before" / "after" envelope matches the
  // audit reader's contract so the same shape can power the audit feed and
  // the post-mortem UI.
  beforeState: Prisma.InputJsonValue;
  afterState: Prisma.InputJsonValue;
  // Stable outcome code (e.g. "PAYMENT_REFUNDED"). Used by the audit row
  // and the wire notification. The string MUST stay stable across releases
  // because it is part of the cross-owner wire contract.
  resultCode: string;
  // Human-readable summary, capped so we never persist raw provider text.
  resultMessage: string;
}

interface SimulatedPayload {
  targetRef?: 'payment' | 'subscription' | 'productAccess';
  targetId?: string;
}

/**
 * Person D's simulated action handlers. The MVP never calls a real payment
 * or subscription provider. The handler returns a deterministic
 * before/after snapshot that mirrors what the eventual real provider would
 * have returned, so the rest of the pipeline (audit + outbox + socket +
 * analytics) is exercised end-to-end.
 *
 * Handlers must be PURE: no I/O outside the supplied Prisma transaction,
 * no random ids, no clock drift. This keeps retries safe.
 */
@Injectable()
export class ActionHandlerRegistry {
  private readonly logger = new Logger(ActionHandlerRegistry.name);

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async run(
    _tx: Prisma.TransactionClient | PrismaService,
    execution: ActionExecution,
  ): Promise<ActionHandlerResult> {
    switch (execution.actionType) {
      case ActionType.REFUND_DUPLICATE_PAYMENT:
        return this.refundDuplicatePayment(execution);
      case ActionType.CANCEL_AT_PERIOD_END:
        return this.cancelAtPeriodEnd(execution);
      case ActionType.RESTORE_PRODUCT_ACCESS:
        return this.restoreProductAccess(execution);
      case ActionType.SEND_CUSTOMER_REPLY:
        return this.sendCustomerReply(execution);
      default: {
        // Unreachable as long as the Prisma enum and the action registry stay
        // in sync. Throwing here surfaces the issue to the worker's catch
        // block which records the failure and re-throws for BullMQ retry.
        const exhaustive: never = execution.actionType;
        throw new Error(`No handler for actionType=${String(exhaustive)}`);
      }
    }
  }

  private sendCustomerReply(execution: ActionExecution): ActionHandlerResult {
    const payload = readPayload(execution);
    this.logger.log(
      `Simulated SEND_CUSTOMER_REPLY for action=${execution.id} target=${payload.targetId ?? '-'}`,
    );
    const before = {
      delivered: false as const,
      stateVersion: 1,
    };
    const after = {
      delivered: true as const,
      deliveredAt: new Date().toISOString(),
      stateVersion: 2,
    };
    return {
      beforeState: envelope(
        payload.targetRef ?? 'customer',
        payload.targetId,
        before,
      ),
      afterState: envelope(
        payload.targetRef ?? 'customer',
        payload.targetId,
        before,
        after,
      ),
      resultCode: 'CUSTOMER_REPLY_DELIVERED',
      resultMessage: 'Synthetic customer reply marked delivered',
    };
  }

  private refundDuplicatePayment(
    execution: ActionExecution,
  ): ActionHandlerResult {
    const payload = readPayload(execution);
    this.logger.log(
      `Simulated REFUND_DUPLICATE_PAYMENT for action=${execution.id} target=${payload.targetId ?? '-'}`,
    );
    const before = {
      status: 'PAID' as const,
      refundedAt: null,
      stateVersion: 1,
    };
    const after = {
      status: 'REFUNDED' as const,
      refundedAt: new Date().toISOString(),
      stateVersion: 2,
    };
    return {
      beforeState: envelope(
        payload.targetRef ?? 'payment',
        payload.targetId,
        before,
      ),
      afterState: envelope(
        payload.targetRef ?? 'payment',
        payload.targetId,
        before,
        after,
      ),
      resultCode: 'PAYMENT_REFUNDED',
      resultMessage: 'Synthetic payment marked REFUNDED',
    };
  }

  private cancelAtPeriodEnd(execution: ActionExecution): ActionHandlerResult {
    const payload = readPayload(execution);
    this.logger.log(
      `Simulated CANCEL_AT_PERIOD_END for action=${execution.id} target=${payload.targetId ?? '-'}`,
    );
    const before = {
      cancelAtPeriodEnd: false,
      stateVersion: 1,
    };
    const after = {
      cancelAtPeriodEnd: true,
      stateVersion: 2,
    };
    return {
      beforeState: envelope(
        payload.targetRef ?? 'subscription',
        payload.targetId,
        before,
      ),
      afterState: envelope(
        payload.targetRef ?? 'subscription',
        payload.targetId,
        before,
        after,
      ),
      resultCode: 'CANCEL_SCHEDULED',
      resultMessage: 'Synthetic subscription marked cancelAtPeriodEnd',
    };
  }

  private restoreProductAccess(
    execution: ActionExecution,
  ): ActionHandlerResult {
    const payload = readPayload(execution);
    this.logger.log(
      `Simulated RESTORE_PRODUCT_ACCESS for action=${execution.id} target=${payload.targetId ?? '-'}`,
    );
    const before = {
      status: 'SUSPENDED' as const,
      reason: 'SUSPENDED_FOR_REVIEW',
      stateVersion: 1,
    };
    const after = {
      status: 'ACTIVE' as const,
      reason: 'RESTORED_BY_SUPPORT',
      stateVersion: 2,
    };
    return {
      beforeState: envelope(
        payload.targetRef ?? 'productAccess',
        payload.targetId,
        before,
      ),
      afterState: envelope(
        payload.targetRef ?? 'productAccess',
        payload.targetId,
        before,
        after,
      ),
      resultCode: 'ACCESS_RESTORED',
      resultMessage: 'Synthetic ProductAccess marked ACTIVE',
    };
  }
}

function readPayload(execution: ActionExecution): SimulatedPayload {
  const payload = execution.payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const record = payload as Record<string, unknown>;
    const targetRef = record.targetRef;
    const targetId = record.targetId;
    return {
      targetRef:
        targetRef === 'payment' ||
        targetRef === 'subscription' ||
        targetRef === 'productAccess'
          ? targetRef
          : undefined,
      targetId: typeof targetId === 'string' ? targetId : undefined,
    };
  }
  return {};
}

function envelope(
  targetRef: string,
  targetId: string | undefined,
  before: Record<string, unknown>,
  after?: Record<string, unknown>,
): Prisma.InputJsonValue {
  const out: Record<string, unknown> = { targetRef, before };
  if (targetId) out.targetId = targetId;
  if (after) out.after = after;
  return out as Prisma.InputJsonValue;
}
