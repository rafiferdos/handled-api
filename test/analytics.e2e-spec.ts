import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/config/configure-app.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import {
  AccessContextResolver,
  WorkspaceRole,
} from '../src/common/contracts/access-context.js';
import {
  ActionExecutionStatus,
  AuditSubjectType,
  OutboxStatus,
} from '../src/generated/prisma/client.js';

const WORKSPACE_A = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
const OTHER_WORKSPACE = '5d8c536b-86aa-456d-9bbf-9b1bd58406c3';

interface ActionRow {
  id: string;
  workspaceId: string;
  actionType: string;
  status: ActionExecutionStatus;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempt: number;
}

interface AuditRow {
  id: string;
  workspaceId: string;
  subjectType: AuditSubjectType;
  createdAt: Date;
}

interface OutboxRow {
  id: string;
  workspaceId: string;
  status: OutboxStatus;
  nextAttemptAt: Date;
}

function makePrismaStub(
  opts: {
    actions?: ActionRow[];
    audit?: AuditRow[];
    outbox?: OutboxRow[];
  } = {},
) {
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
            const key = Object.keys(orderBy)[0];
            const dir = Object.values(orderBy)[0] === 'desc' ? -1 : 1;
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

function makeAccessResolver(role: WorkspaceRole, workspaceId: string) {
  return {
    authenticate: (req: { headers: Record<string, string> }) => {
      if (req.headers.authorization !== 'Bearer test-identity')
        return Promise.resolve(null);
      return Promise.resolve({ id: 'test-user' });
    },
    resolveMembership: (userId: string, requestedWorkspace: string) => {
      if (requestedWorkspace !== workspaceId) return Promise.resolve(null);
      return Promise.resolve({
        id: 'membership',
        userId,
        workspaceId: requestedWorkspace,
        role,
        status: 'ACTIVE',
      });
    },
  };
}

interface E2EContext {
  app: NestExpressApplication;
  close: () => Promise<void>;
}

async function bootstrap(
  role: WorkspaceRole,
  workspaceId: string,
  prisma: ReturnType<typeof makePrismaStub>,
): Promise<E2EContext> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(PrismaService)
    .useValue({
      onModuleInit: vi.fn(),
      onModuleDestroy: vi.fn(),
      $queryRaw: vi.fn().mockResolvedValue([1]),
      ...prisma,
    })
    .overrideProvider(AccessContextResolver)
    .useValue(makeAccessResolver(role, workspaceId))
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();
  return { app, close: async () => app.close() };
}

describe('Person D — analytics endpoints (read-only)', () => {
  describe('GET /workspaces/:id/analytics/actions', () => {
    it('returns aggregated action outcomes grouped by actionType, scoped to the workspace', async () => {
      const now = new Date();
      const actions: ActionRow[] = [
        {
          id: 'a1',
          workspaceId: WORKSPACE_A,
          actionType: 'REFUND_DUPLICATE_PAYMENT',
          status: ActionExecutionStatus.SUCCEEDED,
          queuedAt: now,
          startedAt: new Date(now.getTime() - 1_000),
          finishedAt: now,
          attempt: 1,
        },
        {
          id: 'a2',
          workspaceId: WORKSPACE_A,
          actionType: 'REFUND_DUPLICATE_PAYMENT',
          status: ActionExecutionStatus.FAILED,
          queuedAt: now,
          startedAt: new Date(now.getTime() - 2_000),
          finishedAt: now,
          attempt: 2,
        },
        {
          id: 'a3',
          workspaceId: OTHER_WORKSPACE, // different tenant — must NOT appear
          actionType: 'REFUND_DUPLICATE_PAYMENT',
          status: ActionExecutionStatus.SUCCEEDED,
          queuedAt: now,
          startedAt: now,
          finishedAt: now,
          attempt: 1,
        },
      ];
      const prisma = makePrismaStub({ actions });
      const ctx = await bootstrap(WorkspaceRole.ADMIN, WORKSPACE_A, prisma);
      try {
        const response = await request(ctx.app.getHttpServer())
          .get(
            `/api/v1/workspaces/${WORKSPACE_A}/analytics/actions?windowDays=7`,
          )
          .set('Authorization', 'Bearer test-identity')
          .expect(200);

        expect(response.body.data.windowDays).toBe(7);
        expect(response.body.data.totalExecutions).toBe(2);
        expect(response.body.data.buckets).toHaveLength(1);
        expect(response.body.data.buckets[0]).toMatchObject({
          actionType: 'REFUND_DUPLICATE_PAYMENT',
          total: 2,
          succeeded: 1,
          failed: 1,
          outcomeUnknown: 0,
          avgLatencyMs: 1500, // (1000 + 2000) / 2 — round() of 1500
        });
      } finally {
        await ctx.close();
      }
    });

    it('rejects invalid windowDays with 400 VALIDATION_ERROR and does not leak internals', async () => {
      const prisma = makePrismaStub();
      const ctx = await bootstrap(WorkspaceRole.ADMIN, WORKSPACE_A, prisma);
      try {
        const response = await request(ctx.app.getHttpServer())
          .get(
            `/api/v1/workspaces/${WORKSPACE_A}/analytics/actions?windowDays=0`,
          )
          .set('Authorization', 'Bearer test-identity')
          .expect(400);

        expect(response.body.error.code).toBe('VALIDATION_ERROR');
        expect(response.body.error.details.length).toBeGreaterThan(0);
      } finally {
        await ctx.close();
      }
    });

    it('forbids VIEWER (only ADMIN + AGENT are admitted) with 403', async () => {
      const prisma = makePrismaStub();
      const ctx = await bootstrap(WorkspaceRole.VIEWER, WORKSPACE_A, prisma);
      try {
        await request(ctx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/analytics/actions`)
          .set('Authorization', 'Bearer test-identity')
          .expect(403);
      } finally {
        await ctx.close();
      }
    });
  });

  describe('GET /workspaces/:id/analytics/audit', () => {
    it('returns audit counts grouped by subjectType', async () => {
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
          workspaceId: OTHER_WORKSPACE,
          subjectType: AuditSubjectType.TICKET,
          createdAt: now,
        },
      ];
      const prisma = makePrismaStub({ audit });
      const ctx = await bootstrap(WorkspaceRole.AGENT, WORKSPACE_A, prisma);
      try {
        const response = await request(ctx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/analytics/audit?windowDays=7`)
          .set('Authorization', 'Bearer test-identity')
          .expect(200);

        expect(response.body.data.windowDays).toBe(7);
        expect(response.body.data.totalEvents).toBe(3);
        expect(response.body.data.bySubject).toEqual({
          TICKET: 2,
          ACTION_EXECUTION: 1,
        });
      } finally {
        await ctx.close();
      }
    });
  });

  describe('GET /workspaces/:id/analytics/outbox', () => {
    it('returns counts by status + age of oldest PENDING, restricted to ADMIN', async () => {
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
      ];
      const prisma = makePrismaStub({ outbox });
      // AGENT is a stricter-than-needed role: the controller only admits
      // ADMIN. This must end in 403.
      const agentCtx = await bootstrap(
        WorkspaceRole.AGENT,
        WORKSPACE_A,
        prisma,
      );
      try {
        await request(agentCtx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/analytics/outbox`)
          .set('Authorization', 'Bearer test-identity')
          .expect(403);
      } finally {
        await agentCtx.close();
      }

      const adminCtx = await bootstrap(
        WorkspaceRole.ADMIN,
        WORKSPACE_A,
        prisma,
      );
      try {
        const response = await request(adminCtx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/analytics/outbox`)
          .set('Authorization', 'Bearer test-identity')
          .expect(200);
        expect(response.body.data).toEqual({
          pending: 2,
          claimed: 0,
          sent: 1,
          failed: 1,
          avgPendingAgeSeconds: 15,
        });
      } finally {
        await adminCtx.close();
      }
    });

    it('reports null avgPendingAgeSeconds when no PENDING rows exist', async () => {
      const prisma = makePrismaStub({
        outbox: [
          {
            id: '1',
            workspaceId: WORKSPACE_A,
            status: OutboxStatus.SENT,
            nextAttemptAt: new Date(),
          },
        ],
      });
      const ctx = await bootstrap(WorkspaceRole.ADMIN, WORKSPACE_A, prisma);
      try {
        const response = await request(ctx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/analytics/outbox`)
          .set('Authorization', 'Bearer test-identity')
          .expect(200);

        expect(response.body.data.pending).toBe(0);
        expect(response.body.data.avgPendingAgeSeconds).toBeNull();
      } finally {
        await ctx.close();
      }
    });
  });

  describe('GET /workspaces/:id/analytics', () => {
    it('combines actions + audit + outbox in one response', async () => {
      const now = new Date();
      const prisma = makePrismaStub({
        actions: [
          {
            id: 'a1',
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
      const ctx = await bootstrap(WorkspaceRole.ADMIN, WORKSPACE_A, prisma);
      try {
        const response = await request(ctx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/analytics?windowDays=7`)
          .set('Authorization', 'Bearer test-identity')
          .expect(200);
        expect(response.body.data.actions.buckets).toHaveLength(1);
        expect(response.body.data.audit.totalEvents).toBe(1);
        expect(response.body.data.outbox.sent).toBe(1);
      } finally {
        await ctx.close();
      }
    });
  });

  describe('cross-tenant isolation', () => {
    it("returns 404 — never the other workspace's payload — when the request claims a different workspaceId", async () => {
      const prisma = makePrismaStub();
      const ctx = await bootstrap(WorkspaceRole.ADMIN, WORKSPACE_A, prisma);
      try {
        await request(ctx.app.getHttpServer())
          .get(
            `/api/v1/workspaces/${OTHER_WORKSPACE}/analytics/actions?windowDays=7`,
          )
          .set('Authorization', 'Bearer test-identity')
          .expect(404);
      } finally {
        await ctx.close();
      }
    });
  });
});
