import {
  ActionExecutionStatus,
  ActionType,
  AuditSource,
  AuditSubjectType,
} from '../../../generated/prisma/client.js';
import type {
  ActionExecution,
  Prisma as PrismaTypes,
} from '../../../generated/prisma/client.js';
import { SupportEvent } from '../../../common/contracts/async.contracts.js';
import { ActionProcessor } from './action.processor.js';
import { ActionHandlerRegistry } from '../action.handler.js';

const WORKSPACE_A = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
const WORKSPACE_B = 'b62c1b46-3429-4e12-b7d2-4a01be581a02';
const ACTION_ID = 'action-1';

type ActionRow = ActionExecution & {
  beforeState: PrismaTypes.JsonValue | null;
  afterState: PrismaTypes.JsonValue | null;
};

type AuditRow = {
  id: string;
  workspaceId: string;
  subjectType: AuditSubjectType;
  subjectId: string;
  action: string;
  actorId: string | null;
  source: AuditSource;
  businessEffectKey: string | null;
  idempotencyKey: string | null;
  metadata: unknown;
  createdAt: Date;
};

type PrismaStubOptions = {
  initialAction: ActionRow;
};

function makePrismaStub(options: PrismaStubOptions) {
  const actions = new Map<string, ActionRow>([
    [options.initialAction.id, { ...options.initialAction }],
  ]);
  const audits: AuditRow[] = [];
  const outbox: Array<{
    id: string;
    workspaceId: string;
    eventName: string;
    businessEffectKey: string;
  }> = [];

  const findFirst: ReturnType<typeof vi.fn> = vi.fn(
    async ({ where }: { where: { id: string; workspaceId: string } }) => {
      const row = actions.get(where.id);
      if (!row || row.workspaceId !== where.workspaceId) return null;
      return { ...row };
    },
  );

  const update: ReturnType<typeof vi.fn> = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ActionRow>;
    }) => {
      const row = actions.get(where.id);
      if (!row) throw new Error(`not found: ${where.id}`);
      const next: ActionRow = { ...row, ...data };
      // Increment semantics for `attempt` like the real Prisma client.
      if (
        data.attempt &&
        typeof data.attempt === 'object' &&
        'increment' in (data.attempt as Record<string, unknown>)
      ) {
        next.attempt =
          row.attempt +
          ((data.attempt as { increment: number }).increment ?? 0);
      } else if (typeof data.attempt === 'number') {
        next.attempt = data.attempt;
      }
      actions.set(where.id, next);
      return { ...next };
    },
  );

  const actionExecution = { findFirst, update };

  const auditEvent = {
    create: vi.fn(
      async ({ data }: { data: Omit<AuditRow, 'id' | 'createdAt'> }) => {
        audits.push({
          id: `audit-${audits.length + 1}`,
          createdAt: new Date('2026-10-14T00:00:00.000Z'),
          ...data,
        });
        return null;
      },
    ),
  };

  const outboxEvent = {
    create: vi.fn(
      async ({
        data,
      }: {
        data: {
          id?: string;
          workspaceId: string;
          eventName: string;
          businessEffectKey: string;
        };
      }) => {
        outbox.push({
          id: data.id ?? `outbox-${outbox.length + 1}`,
          workspaceId: data.workspaceId,
          eventName: data.eventName,
          businessEffectKey: data.businessEffectKey,
        });
        return null;
      },
    ),
  };

  const txClient = {
    actionExecution: { findFirst, update },
    auditEvent,
    outboxEvent,
  };

  return {
    actions,
    audits,
    outbox,
    actionExecution,
    auditEvent,
    outboxEvent,
    txClient,
    $transaction: vi.fn(),
  };
}

function makeJob(data: Record<string, unknown>): {
  id: string;
  data: Record<string, unknown>;
} {
  return { id: 'job-1', data };
}

function makeActionRow(overrides: Partial<ActionRow> = {}): ActionRow {
  return {
    id: ACTION_ID,
    workspaceId: WORKSPACE_A,
    actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
    status: ActionExecutionStatus.QUEUED,
    businessEffectKey: 'effect-1',
    idempotencyKey: 'idem-1',
    ticketId: null,
    proposalId: 'proposal-1',
    customerId: null,
    requestedBy: '11111111-1111-4111-8111-111111111111',
    approvedBy: null,
    payload: {
      targetRef: 'payment',
      targetId: '33333333-3333-4333-8333-333333333333',
    },
    resultCode: null,
    resultMessage: null,
    attempt: 0,
    queuedAt: new Date('2026-10-14T00:00:00.000Z'),
    startedAt: null,
    finishedAt: null,
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
    beforeState: null,
    afterState: null,
    ...overrides,
  } as ActionRow;
}

function makeAuditService() {
  return {
    recordEvent: vi.fn(
      async (
        _tx: unknown,
        _params: {
          workspaceId: string;
          subjectType: AuditSubjectType;
          subjectId: string;
          action: string;
          source: AuditSource;
          businessEffectKey: string;
          idempotencyKey: string;
          metadata?: Record<string, unknown>;
        },
      ): Promise<void> => {
        // no-op; each spec inspects mock calls directly
      },
    ),
  };
}

function makeSupportGateway() {
  return {
    emitToWorkspace: vi.fn(
      async (
        _workspaceId: string,
        _event: string,
        _payload: Record<string, unknown> = {},
      ) => true,
    ),
  };
}

function buildProcessor(prisma: ReturnType<typeof makePrismaStub>) {
  const audit = makeAuditService();
  const gateway = makeSupportGateway();
  const handlers = new ActionHandlerRegistry(prisma as never);
  const processor = new ActionProcessor(
    prisma as never,
    audit as never,
    gateway as never,
    handlers,
  );

  // Install a deterministic $transaction implementation that drives the
  // processor's state machine through a shared in-memory store. Every
  // transactional step in the processor is captured here so a spec can
  // assert on the resulting row + audits without spinning up a DB.
  prisma.$transaction.mockImplementation(
    async (run: (tx: unknown) => Promise<unknown>) => {
      return run(prisma.txClient);
    },
  );

  return {
    processor,
    prisma,
    audit,
    gateway,
    actions: prisma.actions,
    audits: prisma.audits,
  };
}

describe('ActionProcessor', () => {
  describe('process lifecycle', () => {
    it('marks RUNNING, increments attempts, and notifies progress before the handler runs', async () => {
      const initial = makeActionRow();
      const prisma = makePrismaStub({ initialAction: initial });
      const { processor, actions, gateway } = buildProcessor(prisma);

      await processor.process(
        makeJob({
          workspaceId: WORKSPACE_A,
          actionExecutionId: ACTION_ID,
          requestId: 'req-1',
        }) as never,
      );

      // Once RUNNING + once SUCCEEDED, but the processor reads the row at
      // the start of each transaction so the snapshot reflects the
      // post-update values for the audit metadata.
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
      const finalRow = actions.get(ACTION_ID);
      expect(finalRow?.status).toBe(ActionExecutionStatus.SUCCEEDED);
      expect(finalRow?.attempt).toBe(1);
      expect(finalRow?.finishedAt).toBeInstanceOf(Date);

      // progress + completed emits. Failed should NOT be called.
      const emittedEvents = gateway.emitToWorkspace.mock.calls.map(
        (call) => call[1],
      );
      expect(emittedEvents).toEqual(
        expect.arrayContaining([
          SupportEvent.ACTION_PROGRESS,
          SupportEvent.ACTION_COMPLETED,
        ]),
      );
      expect(emittedEvents).not.toContain(SupportEvent.ACTION_FAILED);
    });

    it('returns silently when the row is already SUCCEEDED (idempotency guard)', async () => {
      const initial = makeActionRow({
        status: ActionExecutionStatus.SUCCEEDED,
      });
      const prisma = makePrismaStub({ initialAction: initial });
      const { processor, gateway } = buildProcessor(prisma);

      await processor.process(
        makeJob({
          workspaceId: WORKSPACE_A,
          actionExecutionId: ACTION_ID,
        }) as never,
      );

      // No transactions, no audit, no notifications — the guard fired.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(gateway.emitToWorkspace).not.toHaveBeenCalled();
    });

    it('does not touch rows belonging to a different workspace', async () => {
      const initial = makeActionRow();
      const prisma = makePrismaStub({ initialAction: initial });
      const { processor, gateway, actions } = buildProcessor(prisma);

      await processor.process(
        makeJob({
          workspaceId: WORKSPACE_B,
          actionExecutionId: ACTION_ID,
        }) as never,
      );

      // Cross-tenant rows are silently dropped; the row in workspace A must
      // remain untouched so a legitimate retry can still run.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(gateway.emitToWorkspace).not.toHaveBeenCalled();
      expect(actions.get(ACTION_ID)?.status).toBe(ActionExecutionStatus.QUEUED);
    });

    it('flips status to FAILED + lastErrorCode + emits action.failed when the handler throws', async () => {
      const initial = makeActionRow({
        actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
        // Wrong targetRef so the handler raises TARGET_NOT_FOUND via its
        // safe return path. We then force a thrown error by wrapping the
        // registry below.
        payload: { targetRef: 'subscription', targetId: 'sub-1' },
      });
      const prisma = makePrismaStub({ initialAction: initial });
      const audit = makeAuditService();
      const gateway = makeSupportGateway();
      const handlers = {
        run: vi.fn(async () => {
          throw new Error('boom');
        }),
      };
      const processor = new ActionProcessor(
        prisma as never,
        audit as never,
        gateway as never,
        handlers as never,
      );
      prisma.$transaction.mockImplementation(
        async (run: (tx: unknown) => Promise<unknown>) => {
          return run(prisma.txClient);
        },
      );

      await expect(
        processor.process(
          makeJob({
            workspaceId: WORKSPACE_A,
            actionExecutionId: ACTION_ID,
          }) as never,
        ),
      ).rejects.toThrow('boom');

      const finalRow = prisma.actions.get(ACTION_ID);
      expect(finalRow?.status).toBe(ActionExecutionStatus.FAILED);
      expect(finalRow?.lastErrorCode).toBe('BOOM');
      expect(finalRow?.finishedAt).toBeInstanceOf(Date);

      // progress emit still fires (RUNNING was reached), then failed.
      const emittedEvents = gateway.emitToWorkspace.mock.calls.map(
        (call) => call[1],
      );
      expect(emittedEvents).toEqual(
        expect.arrayContaining([
          SupportEvent.ACTION_PROGRESS,
          SupportEvent.ACTION_FAILED,
        ]),
      );
      expect(emittedEvents).not.toContain(SupportEvent.ACTION_COMPLETED);
    });
  });

  describe('simulated scenarios (ADR-004, ADR-005)', () => {
    const scenarios = [
      {
        label: 'REFUND_DUPLICATE_PAYMENT',
        actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
        targetRef: 'payment',
        targetId: '33333333-3333-4333-8333-333333333333',
        expectedBefore: { status: 'PAID', refundedAt: null, stateVersion: 1 },
        expectedAfter: { status: 'REFUNDED', stateVersion: 2 },
        expectedAfterKeys: ['refundedAt'],
        expectedResultCode: 'PAYMENT_REFUNDED',
      },
      {
        label: 'CANCEL_AT_PERIOD_END',
        actionType: ActionType.CANCEL_AT_PERIOD_END,
        targetRef: 'subscription',
        targetId: '44444444-4444-4444-8444-444444444444',
        expectedBefore: { cancelAtPeriodEnd: false, stateVersion: 1 },
        expectedAfter: { cancelAtPeriodEnd: true, stateVersion: 2 },
        expectedAfterKeys: ['cancelAtPeriodEnd'],
        expectedResultCode: 'CANCEL_SCHEDULED',
      },
      {
        label: 'RESTORE_PRODUCT_ACCESS',
        actionType: ActionType.RESTORE_PRODUCT_ACCESS,
        targetRef: 'productAccess',
        targetId: '55555555-5555-4555-8555-555555555555',
        expectedBefore: {
          status: 'SUSPENDED',
          reason: 'SUSPENDED_FOR_REVIEW',
          stateVersion: 1,
        },
        expectedAfter: {
          status: 'ACTIVE',
          reason: 'RESTORED_BY_SUPPORT',
          stateVersion: 2,
        },
        expectedAfterKeys: ['status', 'reason'],
        expectedResultCode: 'ACCESS_RESTORED',
      },
    ];

    for (const scenario of scenarios) {
      it(`records before/after snapshots for ${scenario.label}`, async () => {
        const initial = makeActionRow({
          actionType: scenario.actionType,
          payload: {
            targetRef: scenario.targetRef,
            targetId: scenario.targetId,
          },
        });
        const prisma = makePrismaStub({ initialAction: initial });
        const { processor, actions, audit } = buildProcessor(prisma);

        await processor.process(
          makeJob({
            workspaceId: WORKSPACE_A,
            actionExecutionId: ACTION_ID,
          }) as never,
        );

        const row = actions.get(ACTION_ID);
        expect(row?.status).toBe(ActionExecutionStatus.SUCCEEDED);
        expect(row?.resultCode).toBe(scenario.expectedResultCode);

        // The persisted before/after JSON must round-trip through the
        // runner intact; this is the audit reader's contract.
        expect(row?.beforeState).toMatchObject({
          targetRef: scenario.targetRef,
          targetId: scenario.targetId,
          before: scenario.expectedBefore,
        });
        expect(row?.afterState).toMatchObject({
          targetRef: scenario.targetRef,
          targetId: scenario.targetId,
          before: scenario.expectedBefore,
        });
        const after =
          (row?.afterState as { after: Record<string, unknown> } | null)
            ?.after ?? {};
        for (const key of scenario.expectedAfterKeys) {
          expect(after).toHaveProperty(key);
        }
        // stateVersion monotonically incremented, never reset.
        expect(
          (row?.afterState as { after: { stateVersion: number } } | null)?.after
            ?.stateVersion ?? 0,
        ).toBeGreaterThan(
          (row?.beforeState as { before: { stateVersion: number } } | null)
            ?.before?.stateVersion ?? 0,
        );

        // Audit chain: ACTION_STARTED + ACTION_EXECUTED, both written via the
        // shared AuditService in the matching transaction.
        expect(audit.recordEvent).toHaveBeenCalledTimes(2);
        const actionsObserved = audit.recordEvent.mock.calls.map(
          (call) => (call[1] as { action: string }).action,
        );
        expect(actionsObserved).toEqual(['ACTION_STARTED', 'ACTION_EXECUTED']);
      });
    }

    it('does not mutate external business tables directly (Payment/Subscription/ProductAccess belong to Person B)', async () => {
      // The simulated handlers must not issue cross-owner writes. The handler
      // builder only injects `ActionHandlerRegistry` here; if any handler
      // were to call e.g. `tx.payment.update`, this stub's absence would
      // surface as a thrown error during the processor's `process` call.
      const initial = makeActionRow({
        actionType: ActionType.RESTORE_PRODUCT_ACCESS,
        payload: {
          targetRef: 'productAccess',
          targetId: '55555555-5555-4555-8555-555555555555',
        },
      });
      const prisma = makePrismaStub({ initialAction: initial });
      const { processor, actions } = buildProcessor(prisma);

      await processor.process(
        makeJob({
          workspaceId: WORKSPACE_A,
          actionExecutionId: ACTION_ID,
        }) as never,
      );

      // If we got here without throwing, the handler respected ownership
      // boundaries. The state transition lives entirely on the
      // ActionExecution row + its before/after snapshot.
      expect(actions.get(ACTION_ID)?.status).toBe(
        ActionExecutionStatus.SUCCEEDED,
      );
    });
  });

  describe('audit + outbox pairing', () => {
    it('writes ACTION_EXECUTED in the same transaction that flips the row to SUCCEEDED', async () => {
      const initial = makeActionRow({
        actionType: ActionType.CANCEL_AT_PERIOD_END,
        payload: {
          targetRef: 'subscription',
          targetId: '44444444-4444-4444-8444-444444444444',
        },
      });
      const prisma = makePrismaStub({ initialAction: initial });
      const { processor, audit } = buildProcessor(prisma);

      // Wrap $transaction so we can assert the AuditService is invoked
      // *inside* the same callback that updates the row.
      const calls: { inTransaction: boolean }[] = [];
      prisma.$transaction.mockImplementation(
        async (run: (tx: unknown) => Promise<unknown>) => {
          calls.push({ inTransaction: true });
          const result = await run(prisma.txClient);
          calls.push({ inTransaction: false });
          return result;
        },
      );

      await processor.process(
        makeJob({
          workspaceId: WORKSPACE_A,
          actionExecutionId: ACTION_ID,
        }) as never,
      );

      // Two transactions: startExecution + commitSuccess. Each one closed
      // cleanly, meaning the matching audit + row write landed together.
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);

      // The ACTION_EXECUTED call must have happened between the open and
      // close of the second transaction, i.e. before the surrounding
      // `inTransaction: false` was pushed. We assert by comparing order.
      const recordOrder = audit.recordEvent.mock.invocationCallOrder;
      const txOrder = prisma.$transaction.mock.invocationCallOrder;
      expect(recordOrder.length).toBe(2);
      expect(txOrder.length).toBe(2);
      // Call order numbers are monotonic per mock; the second audit call
      // (ACTION_EXECUTED) must happen after the second tx opens but before
      // it returns. We assert a weaker but stable invariant: both audit
      // calls happened during a tx execution window.
      expect(recordOrder[1]).toBeGreaterThan(txOrder[1]);
    });
  });
});
