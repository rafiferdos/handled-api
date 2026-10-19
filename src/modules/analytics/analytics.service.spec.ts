import {
  ActionExecutionStatus,
  AuditSubjectType,
  OutboxStatus,
} from '../../generated/prisma/client.js';
import { AnalyticsService } from './analytics.service.js';

const WORKSPACE_A = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
const WORKSPACE_B = 'b62c1b46-3429-4e12-b7d2-4a01be581a02';

type ActionRow = {
  id: string;
  workspaceId: string;
  actionType: string;
  status: ActionExecutionStatus;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempt: number;
};

type AuditRow = {
  id: string;
  workspaceId: string;
  subjectType: AuditSubjectType;
  createdAt: Date;
};

type OutboxRow = {
  id: string;
  workspaceId: string;
  status: OutboxStatus;
  nextAttemptAt: Date;
};

function makePrismaStub(opts: {
  actions?: ActionRow[];
  audit?: AuditRow[];
  outbox?: OutboxRow[];
}) {
  const actions = opts.actions ?? [];
  const audit = opts.audit ?? [];
  const outbox = opts.outbox ?? [];

  const actionExecution = {
    groupBy: vi.fn(
      async ({
        by,
        where,
      }: {
        by: string[];
        where: { workspaceId: string; queuedAt: { gte: Date } };
      }) => {
        const filtered = actions.filter(
          (row) =>
            row.workspaceId === where.workspaceId &&
            row.queuedAt.getTime() >= where.queuedAt.gte.getTime(),
        );
        const groups = new Map<
          string,
          { sumAttempt: number; count: number; by: Record<string, string> }
        >();
        for (const row of filtered) {
          const key = by
            .map((b) => (row as unknown as Record<string, string>)[b])
            .join('|');
          const existing = groups.get(key) ?? {
            sumAttempt: 0,
            count: 0,
            by: {},
          };
          existing.sumAttempt += row.attempt;
          existing.count += 1;
          for (const b of by)
            existing.by[b] = (row as unknown as Record<string, string>)[b];
          groups.set(key, existing);
        }
        return Array.from(groups.values()).map((entry) => ({
          ...entry.by,
          _count: { _all: entry.count },
          _avg: {
            attempt: entry.count > 0 ? entry.sumAttempt / entry.count : 0,
          },
        }));
      },
    ),
    findMany: vi.fn(
      async ({
        where,
        take,
        select,
      }: {
        where: {
          workspaceId: string;
          queuedAt: { gte: Date };
          finishedAt: { not: null };
          startedAt: { not: null };
        };
        take: number;
        select: Record<string, true>;
      }) => {
        return actions
          .filter(
            (row) =>
              row.workspaceId === where.workspaceId &&
              row.queuedAt.getTime() >= where.queuedAt.gte.getTime() &&
              row.finishedAt !== null &&
              row.startedAt !== null,
          )
          .slice(0, take)
          .map((row) => {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(select)) {
              (out as Record<string, unknown>)[key] = (
                row as unknown as Record<string, unknown>
              )[key];
            }
            return out;
          });
      },
    ),
  };

  const auditEvent = {
    groupBy: vi.fn(
      async ({
        by,
        where,
      }: {
        by: string[];
        where: { workspaceId: string; createdAt: { gte: Date } };
      }) => {
        const filtered = audit.filter(
          (row) =>
            row.workspaceId === where.workspaceId &&
            row.createdAt.getTime() >= where.createdAt.gte.getTime(),
        );
        const groups = new Map<
          string,
          { by: Record<string, string>; count: number }
        >();
        for (const row of filtered) {
          const key = by
            .map((b) => (row as unknown as Record<string, string>)[b])
            .join('|');
          const existing = groups.get(key) ?? { by: {}, count: 0 };
          for (const b of by)
            existing.by[b] = (row as unknown as Record<string, string>)[b];
          existing.count += 1;
          groups.set(key, existing);
        }
        return Array.from(groups.values()).map((entry) => ({
          ...entry.by,
          _count: { _all: entry.count },
        }));
      },
    ),
  };

  const outboxEvent = {
    groupBy: vi.fn(async ({ where }: { where: { workspaceId: string } }) => {
      const filtered = outbox.filter(
        (row) => row.workspaceId === where.workspaceId,
      );
      const groups = new Map<string, number>();
      for (const row of filtered) {
        groups.set(row.status, (groups.get(row.status) ?? 0) + 1);
      }
      return Array.from(groups.entries()).map(([status, count]) => ({
        status,
        _count: { _all: count },
      }));
    }),
    findFirst: vi.fn(
      async ({
        where,
        orderBy,
        select,
      }: {
        where: { workspaceId: string; status: OutboxStatus };
        orderBy: Record<string, 'asc' | 'desc'>;
        select: Record<string, true>;
      }) => {
        const filtered = outbox
          .filter(
            (row) =>
              row.workspaceId === where.workspaceId &&
              row.status === where.status,
          )
          .sort((a, b) => {
            const dir = Object.values(orderBy)[0] === 'desc' ? -1 : 1;
            const key = Object.keys(orderBy)[0];
            return (
              dir *
              ((a as unknown as Record<string, Date>)[key].getTime() -
                (b as unknown as Record<string, Date>)[key].getTime())
            );
          });
        const first = filtered[0];
        if (!first) return null;
        const out: Record<string, unknown> = {};
        for (const key of Object.keys(select)) {
          (out as Record<string, unknown>)[key] = (
            first as unknown as Record<string, unknown>
          )[key];
        }
        return out;
      },
    ),
  };

  return { actionExecution, auditEvent, outboxEvent };
}

const window = { windowDays: 7 };

describe('AnalyticsService', () => {
  describe('actionOutcomes', () => {
    it('groups by actionType and reports counts + average latency', async () => {
      const now = new Date();
      const actions: ActionRow[] = [
        {
          id: '1',
          workspaceId: WORKSPACE_A,
          actionType: 'REFUND_DUPLICATE_PAYMENT',
          status: ActionExecutionStatus.SUCCEEDED,
          queuedAt: now,
          startedAt: new Date(now.getTime() - 1_000),
          finishedAt: now,
          attempt: 1,
        },
        {
          id: '2',
          workspaceId: WORKSPACE_A,
          actionType: 'REFUND_DUPLICATE_PAYMENT',
          status: ActionExecutionStatus.FAILED,
          queuedAt: now,
          startedAt: new Date(now.getTime() - 2_000),
          finishedAt: now,
          attempt: 2,
        },
        {
          id: '3',
          workspaceId: WORKSPACE_B, // different workspace, must not appear
          actionType: 'REFUND_DUPLICATE_PAYMENT',
          status: ActionExecutionStatus.SUCCEEDED,
          queuedAt: now,
          startedAt: now,
          finishedAt: now,
          attempt: 1,
        },
      ];
      const prisma = makePrismaStub({ actions });
      const service = new AnalyticsService(prisma as never);
      const result = await service.actionOutcomes(WORKSPACE_A, window);
      expect(result.buckets).toHaveLength(1);
      expect(result.buckets[0]).toMatchObject({
        actionType: 'REFUND_DUPLICATE_PAYMENT',
        total: 2,
        succeeded: 1,
        failed: 1,
        outcomeUnknown: 0,
        avgLatencyMs: 1500, // (1000 + 2000) / 2
      });
      expect(result.totalExecutions).toBe(2);
    });

    it('returns an empty payload when the workspace has no executions in the window', async () => {
      const prisma = makePrismaStub({ actions: [] });
      const service = new AnalyticsService(prisma as never);
      const result = await service.actionOutcomes(WORKSPACE_A, window);
      expect(result.buckets).toEqual([]);
      expect(result.totalExecutions).toBe(0);
    });
  });

  describe('auditThroughput', () => {
    it('groups by subjectType and exposes the totals', async () => {
      const now = new Date();
      const audit: AuditRow[] = [
        {
          id: '1',
          workspaceId: WORKSPACE_A,
          subjectType: AuditSubjectType.TICKET,
          createdAt: now,
        },
        {
          id: '2',
          workspaceId: WORKSPACE_A,
          subjectType: AuditSubjectType.TICKET,
          createdAt: now,
        },
        {
          id: '3',
          workspaceId: WORKSPACE_A,
          subjectType: AuditSubjectType.ACTION_EXECUTION,
          createdAt: now,
        },
        {
          id: '4',
          workspaceId: WORKSPACE_B,
          subjectType: AuditSubjectType.TICKET,
          createdAt: now,
        },
      ];
      const prisma = makePrismaStub({ audit });
      const service = new AnalyticsService(prisma as never);
      const result = await service.auditThroughput(WORKSPACE_A, window);
      expect(result.totalEvents).toBe(3);
      expect(result.bySubject).toEqual({
        TICKET: 2,
        ACTION_EXECUTION: 1,
      });
    });
  });

  describe('outboxHealth', () => {
    it('returns counts by status and the age of the oldest PENDING row', async () => {
      const now = Date.now();
      const outbox: OutboxRow[] = [
        {
          id: '1',
          workspaceId: WORKSPACE_A,
          status: OutboxStatus.PENDING,
          nextAttemptAt: new Date(now - 5_000),
        },
        {
          id: '2',
          workspaceId: WORKSPACE_A,
          status: OutboxStatus.PENDING,
          nextAttemptAt: new Date(now - 15_000),
        },
        {
          id: '3',
          workspaceId: WORKSPACE_A,
          status: OutboxStatus.SENT,
          nextAttemptAt: new Date(now),
        },
        {
          id: '4',
          workspaceId: WORKSPACE_A,
          status: OutboxStatus.FAILED,
          nextAttemptAt: new Date(now),
        },
        {
          id: '5',
          workspaceId: WORKSPACE_B,
          status: OutboxStatus.PENDING,
          nextAttemptAt: new Date(now - 1_000_000),
        },
      ];
      const prisma = makePrismaStub({ outbox });
      const service = new AnalyticsService(prisma as never);
      const result = await service.outboxHealth(WORKSPACE_A);
      expect(result.pending).toBe(2);
      expect(result.claimed).toBe(0);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.avgPendingAgeSeconds).toBe(15);
    });

    it('reports null age when no PENDING rows exist', async () => {
      const prisma = makePrismaStub({ outbox: [] });
      const service = new AnalyticsService(prisma as never);
      const result = await service.outboxHealth(WORKSPACE_A);
      expect(result.pending).toBe(0);
      expect(result.avgPendingAgeSeconds).toBeNull();
    });
  });

  describe('summary', () => {
    it('combines all three sub-aggregates into a single response', async () => {
      const now = new Date();
      const prisma = makePrismaStub({
        actions: [
          {
            id: '1',
            workspaceId: WORKSPACE_A,
            actionType: 'CANCEL_AT_PERIOD_END',
            status: ActionExecutionStatus.SUCCEEDED,
            queuedAt: now,
            startedAt: new Date(now.getTime() - 500),
            finishedAt: now,
            attempt: 1,
          },
        ],
        audit: [
          {
            id: '1',
            workspaceId: WORKSPACE_A,
            subjectType: AuditSubjectType.TICKET,
            createdAt: now,
          },
        ],
        outbox: [
          {
            id: '1',
            workspaceId: WORKSPACE_A,
            status: OutboxStatus.SENT,
            nextAttemptAt: now,
          },
        ],
      });
      const service = new AnalyticsService(prisma as never);
      const summary = await service.summary(WORKSPACE_A, window);
      expect(summary.actions.buckets).toHaveLength(1);
      expect(summary.audit.totalEvents).toBe(1);
      expect(summary.outbox.sent).toBe(1);
    });
  });
});
