import { ActionService } from './action.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import {
  ActionExecutionStatus,
  ActionType,
  AuditSource,
  AuditSubjectType,
} from '../../generated/prisma/client.js';
import { SupportEvent } from '../../common/contracts/async.contracts.js';

type ActionRow = {
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
  payload: unknown;
  resultCode: string | null;
  resultMessage: string | null;
  attempt: number;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;

  beforeState: unknown;
  afterState: unknown;
  lastErrorCode: string | null;
  createdAt: Date;
  updatedAt: Date;
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

type OutboxRow = {
  id: string;
  workspaceId: string;
  businessEffectKey: string;
  eventName: string;
  payload: unknown;
  status: string;
};

function makePrismaStub() {
  const actions: ActionRow[] = [];
  const audits: AuditRow[] = [];
  const outbox: OutboxRow[] = [];

  const actionExecution = {
    findUnique: vi.fn(
      async ({
        where,
        select,
      }: {
        where: {
          action_execution_business_effect_unique?: {
            workspaceId: string;
            businessEffectKey: string;
          };
        };
        select?: { id?: boolean; status?: boolean };
      }) => {
        const filter = where.action_execution_business_effect_unique;
        if (!filter) return null;
        const row = actions.find(
          (a) =>
            a.workspaceId === filter.workspaceId &&
            a.businessEffectKey === filter.businessEffectKey,
        );
        if (!row) return null;
        const out: { id?: string; status?: ActionExecutionStatus } = {};
        if (select?.id !== false) out.id = row.id;
        if (select?.status) out.status = row.status;
        return out;
      },
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { id: string; workspaceId: string } }) => {
        return (
          actions.find(
            (a) => a.id === where.id && a.workspaceId === where.workspaceId,
          ) ?? null
        );
      },
    ),
    findMany: vi.fn(
      async ({
        where,
        orderBy,
      }: {
        where: { workspaceId: string; ticketId?: string };
        orderBy?: { queuedAt?: 'asc' | 'desc' };
      }) => {
        const filtered = actions
          .filter((a) => a.workspaceId === where.workspaceId)
          .filter(
            (a) =>
              where.ticketId === undefined || a.ticketId === where.ticketId,
          );
        const dir = orderBy?.queuedAt === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
          return dir * (a.queuedAt.getTime() - b.queuedAt.getTime());
        });
      },
    ),
    create: vi.fn(
      async ({
        data,
      }: {
        data: Omit<ActionRow, 'id' | 'queuedAt' | 'createdAt' | 'updatedAt'>;
      }) => {
        const now = new Date('2026-10-14T00:00:00.000Z');
        const row: ActionRow = {
          id: `action-${actions.length + 1}`,
          queuedAt: now,
          createdAt: now,
          updatedAt: now,
          ...data,
        };
        actions.push(row);
        return row;
      },
    ),
  };

  const auditEvent = {
    create: vi.fn(
      async ({ data }: { data: Omit<AuditRow, 'id' | 'createdAt'> }) => {
        const row: AuditRow = {
          id: `audit-${audits.length + 1}`,
          createdAt: new Date('2026-10-14T00:00:00.000Z'),
          ...data,
        };
        audits.push(row);
        return row;
      },
    ),
  };

  const outboxEvent = {
    create: vi.fn(async ({ data }: { data: Omit<OutboxRow, 'id'> }) => {
      const row: OutboxRow = { id: `outbox-${outbox.length + 1}`, ...data };
      outbox.push(row);
      return row;
    }),
  };

  // The service uses an interactive transaction (async callback). Honor that
  // contract by running the callback against a transaction-scoped client whose
  // writes append to the same in-memory arrays (and so the service's audit +
  // outbox calls land alongside the action row).
  const txClient = {
    actionExecution,
    auditEvent,
    outboxEvent,
  };

  const $transaction = vi.fn(
    async (run: (tx: typeof txClient) => Promise<unknown>) => run(txClient),
  );

  return {
    actionExecution,
    auditEvent,
    outboxEvent,
    $transaction,
    __seed: { actions, audits, outbox },
  };
}

function makeAuditService() {
  return {
    recordEvent: vi.fn(
      async (
        tx: {
          auditEvent: {
            create: (args: {
              data: Omit<AuditRow, 'id' | 'createdAt'>;
            }) => Promise<AuditRow>;
          };
        },
        params: {
          workspaceId: string;
          subjectType: AuditSubjectType;
          subjectId: string;
          action: string;
          actorId: string | null;
          source: AuditSource;
          businessEffectKey: string;
          idempotencyKey: string;
          metadata: Record<string, unknown>;
        },
      ) => {
        await tx.auditEvent.create({
          data: {
            workspaceId: params.workspaceId,
            subjectType: params.subjectType,
            subjectId: params.subjectId,
            action: params.action,
            actorId: params.actorId,
            source: params.source,
            businessEffectKey: params.businessEffectKey,
            idempotencyKey: params.idempotencyKey,
            metadata: params.metadata,
          },
        });
      },
    ),
  };
}

function makeActionQueueStub() {
  return {
    add: vi.fn(
      async (
        _name: string,
        _payload: Record<string, unknown>,
        _options: Record<string, unknown>,
      ) => ({ id: 'mock-job' }),
    ),
  };
}

function makeService() {
  const prisma = makePrismaStub();
  const audit = makeAuditService();
  const queue = makeActionQueueStub();
  const service = new ActionService(
    prisma as never,
    audit as never,
    queue as never,
  );
  return { service, prisma, audit, queue };
}

function baseParams(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: 'a62c1b46-3429-4e12-b7d2-4a01be581a01',
    proposalId: '11111111-1111-4111-8111-111111111111',
    decisionId: '22222222-2222-4222-8222-222222222222',
    actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
    idempotencyKey: 'idem-1',
    targetRef: 'payment',
    targetId: '33333333-3333-4333-8333-333333333333',
    proposalVersion: 1,
    targetStateVersion: 1,
    input: { amount: 100 },
    actorId: '44444444-4444-4444-8444-444444444444',
    ...overrides,
  };
}

describe('ActionService', () => {
  describe('queueApprovedAction', () => {
    it('persists the execution, audit row, and outbox event inside a single transaction', async () => {
      const { service, prisma, audit, queue } = makeService();
      const result = await service.queueApprovedAction(baseParams());

      expect(result.duplicate).toBe(false);
      expect(result.status).toBe(ActionExecutionStatus.QUEUED);
      expect(result.actionExecutionId).toMatch(/^action-/);

      // One transaction containing the action, audit, and outbox writes.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.__seed.actions).toHaveLength(1);
      expect(prisma.__seed.audits).toHaveLength(1);
      expect(prisma.__seed.outbox).toHaveLength(1);

      // Audit row was written through AuditService (not bypassed) so future
      // redaction rules stay centralized.
      expect(audit.recordEvent).toHaveBeenCalledTimes(1);
      const [txArg, auditParams] = audit.recordEvent.mock.calls[0] as [
        unknown,
        { action: string; businessEffectKey: string },
      ];
      expect(txArg).toBeDefined();
      expect(auditParams.action).toBe('ACTION_QUEUED');
      expect(auditParams.businessEffectKey).toBe(
        prisma.__seed.actions[0].businessEffectKey,
      );

      // Outbox event uses the wire-aligned SupportEvent constant and matches
      // the action's business effect key so the dispatcher can dedupe.
      expect(prisma.__seed.outbox[0].eventName).toBe(
        SupportEvent.ACTION_EXECUTE,
      );
      expect(prisma.__seed.outbox[0].businessEffectKey).toBe(
        prisma.__seed.actions[0].businessEffectKey,
      );

      // BullMQ enqueue happens exactly once, after commit, with the contract:
      //   jobId = action-${id}, 3 attempts, exponential backoff.
      expect(queue.add).toHaveBeenCalledTimes(1);
      const [qName, qPayload, qOptions] = queue.add.mock.calls[0] as [
        string,
        { workspaceId: string; actionExecutionId: string },
        {
          jobId: string;
          attempts: number;
          backoff: { type: string; delay: number };
        },
      ];
      expect(qName).toBe('action');
      expect(qPayload).toEqual({
        workspaceId: prisma.__seed.actions[0].workspaceId,
        actionExecutionId: prisma.__seed.actions[0].id,
      });
      expect(qOptions.jobId).toBe(`action-${prisma.__seed.actions[0].id}`);
      expect(qOptions.attempts).toBe(3);
      expect(qOptions.backoff).toEqual({ type: 'exponential', delay: 1_000 });
    });

    it('returns the existing execution and skips writes when the businessEffectKey is already in the workspace', async () => {
      const { service, prisma, audit, queue } = makeService();
      const params = baseParams();

      const first = await service.queueApprovedAction(params);
      expect(first.duplicate).toBe(false);
      expect(prisma.__seed.actions).toHaveLength(1);
      const callsAfterFirst = {
        tx: prisma.$transaction.mock.calls.length,
        audit: audit.recordEvent.mock.calls.length,
        queue: queue.add.mock.calls.length,
      };

      // A second admission with the same provenance must be a no-op on disk:
      //   - no new action row
      //   - no new audit row
      //   - no new outbox event
      //   - no new BullMQ job
      // The caller still gets the original execution id and current status.
      const second = await service.queueApprovedAction(params);
      expect(second.duplicate).toBe(true);
      expect(second.actionExecutionId).toBe(first.actionExecutionId);
      expect(prisma.__seed.actions).toHaveLength(1);
      expect(prisma.__seed.audits).toHaveLength(1);
      expect(prisma.__seed.outbox).toHaveLength(1);
      expect(prisma.$transaction.mock.calls.length).toBe(callsAfterFirst.tx);
      expect(audit.recordEvent.mock.calls.length).toBe(callsAfterFirst.audit);
      expect(queue.add.mock.calls.length).toBe(callsAfterFirst.queue);
    });

    it('treats the same businessEffectKey under a different workspace as a fresh admission', async () => {
      const { service, prisma } = makeService();
      const workspaceA = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
      const workspaceB = 'b62c1b46-3429-4e12-b7d2-4a01be581a02';

      const first = await service.queueApprovedAction(
        baseParams({ workspaceId: workspaceA }),
      );
      const second = await service.queueApprovedAction(
        baseParams({ workspaceId: workspaceB }),
      );

      expect(first.duplicate).toBe(false);
      expect(second.duplicate).toBe(false);
      expect(first.actionExecutionId).not.toBe(second.actionExecutionId);
      expect(prisma.__seed.actions).toHaveLength(2);
      // Both rows carry the same businessEffectKey (provenance-collision is
      // expected across tenants) but live in separate workspaces.
      expect(prisma.__seed.actions[0].businessEffectKey).toBe(
        prisma.__seed.actions[1].businessEffectKey,
      );
      expect(prisma.__seed.actions[0].workspaceId).toBe(workspaceA);
      expect(prisma.__seed.actions[1].workspaceId).toBe(workspaceB);
    });

    it('surfaces DEPENDENCY_UNAVAILABLE when the BullMQ enqueue fails after commit', async () => {
      const { service, queue, prisma } = makeService();
      queue.add.mockRejectedValueOnce(new Error('redis down'));

      let caught: unknown;
      try {
        await service.queueApprovedAction(baseParams());
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(AppException);
      expect((caught as AppException).code).toBe(
        ErrorCode.DEPENDENCY_UNAVAILABLE,
      );
      // The committed rows are still on disk so a later reconciliation can
      // re-enqueue them; the service does not roll back its own transaction.
      expect(prisma.__seed.actions).toHaveLength(1);
      expect(prisma.__seed.audits).toHaveLength(1);
      expect(prisma.__seed.outbox).toHaveLength(1);
    });
  });

  describe('getActionsByTicket', () => {
    async function seed() {
      const ctx = makeService();
      await ctx.service.queueApprovedAction(
        baseParams({
          idempotencyKey: 'idem-t1-a',
          targetId: '33333333-3333-4333-8333-333333333333',
        }),
      );
      // Force the seeded row's ticketId by mutating the in-memory row; in
      // production ticketId is set by the worker once the simulated effect
      // resolves the soft reference. For the read-path test we just need
      // a stable value to filter on.
      ctx.prisma.__seed.actions[0].ticketId =
        '55555555-5555-4555-8555-555555555555';
      await ctx.service.queueApprovedAction(
        baseParams({
          workspaceId: 'a62c1b46-3429-4e12-b7d2-4a01be581a01',
          proposalId: '99999999-9999-4999-8999-999999999999',
          decisionId: '88888888-8888-4888-8888-888888888888',
          idempotencyKey: 'idem-t1-b',
          targetId: '77777777-7777-4777-8777-777777777777',
        }),
      );
      ctx.prisma.__seed.actions[1].ticketId =
        '55555555-5555-4555-8555-555555555555';
      // A different ticket in the same workspace must be excluded.
      await ctx.service.queueApprovedAction(
        baseParams({
          proposalId: '66666666-6666-4666-8666-666666666661',
          decisionId: '66666666-6666-4666-8666-666666666662',
          idempotencyKey: 'idem-t2',
          targetId: '66666666-6666-4666-8666-666666666663',
          proposalVersion: 7,
          targetStateVersion: 7,
        }),
      );
      ctx.prisma.__seed.actions[2].ticketId =
        '66666666-6666-4666-8666-666666666664';
      return ctx;
    }

    it('returns only the actions for the requested ticket, scoped to the workspace', async () => {
      const { service } = await seed();
      const ticketA = '55555555-5555-4555-8555-555555555555';
      const workspaceA = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
      const rows = await service.getActionsByTicket(workspaceA, ticketA);
      expect(rows).toHaveLength(2);
      expect(rows.every((r) => r.workspaceId === workspaceA)).toBe(true);
      expect(rows.every((r) => r.ticketId === ticketA)).toBe(true);
    });

    it('excludes the requested ticket when the workspace is different', async () => {
      const { service } = await seed();
      const ticketA = '55555555-5555-4555-8555-555555555555';
      const otherWorkspace = 'b62c1b46-3429-4e12-b7d2-4a01be581a02';
      const rows = await service.getActionsByTicket(otherWorkspace, ticketA);
      expect(rows).toEqual([]);
    });
  });

  describe('getActionById', () => {
    it('returns the action when the workspaceId matches', async () => {
      const { service, prisma } = makeService();
      const workspaceA = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
      const created = await service.queueApprovedAction(baseParams());
      const row = await service.getActionById(
        workspaceA,
        created.actionExecutionId,
      );
      expect(row.id).toBe(prisma.__seed.actions[0].id);
      expect(row.status).toBe(ActionExecutionStatus.QUEUED);
    });

    it('throws RESOURCE_NOT_FOUND (not FORBIDDEN) when the action belongs to a different workspace', async () => {
      const { service } = makeService();
      const created = await service.queueApprovedAction(baseParams());
      const otherWorkspace = 'b62c1b46-3429-4e12-b7d2-4a01be581a02';
      try {
        await service.getActionById(otherWorkspace, created.actionExecutionId);
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        expect((err as AppException).code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
      }
    });

    it('throws RESOURCE_NOT_FOUND when the action id does not exist at all', async () => {
      const { service } = makeService();
      const workspaceA = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
      const missing = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      try {
        await service.getActionById(workspaceA, missing);
        throw new Error('expected to throw');
      } catch (err) {
        expect(err).toBeInstanceOf(AppException);
        expect((err as AppException).code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
      }
    });
  });
});
