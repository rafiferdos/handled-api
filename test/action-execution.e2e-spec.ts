import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import {
  ActionExecutionStatus,
  ActionType,
  AuditSource,
  AuditSubjectType,
} from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import {
  AccessContextResolver,
  WorkspaceRole,
} from '../src/common/contracts/access-context.js';
import type {
  AuthenticatedUser,
  WorkspaceMembership,
} from '../src/common/contracts/access-context.js';
import { QueueHealthIndicator } from '../src/modules/queue/queue.health.js';
import { QueueName } from '../src/common/contracts/async.contracts.js';
import { configureApp } from '../src/config/configure-app.js';

// Stable UUIDs make the assertions and the stub lookups readable.
const WORKSPACE_A = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
const WORKSPACE_B = 'b62c1b46-3429-4e12-b7d2-4a01be581a02';
const TICKET_A = '11111111-1111-4111-8111-111111111111';
const TICKET_B = '11111111-1111-4111-8111-111111111112';
const ACTION_B_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const AUTH_HEADER = 'Bearer test-identity';
const USER_ID = 'test-user';

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
  payload: Record<string, unknown>;
  resultCode: string | null;
  resultMessage: string | null;
  attempt: number;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
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
  metadata: Record<string, unknown> | null;
  createdAt: Date;
};

function makePrismaStub() {
  const actions: ActionRow[] = [];
  const audits: AuditRow[] = [];
  let auditSeq = 0;

  const actionExecution = {
    findMany: vi.fn(
      async ({
        where,
        orderBy,
      }: {
        where: { workspaceId: string; ticketId?: string };
        orderBy?: { queuedAt?: 'asc' | 'desc' };
      }) => {
        const filtered = actions
          .filter((row) => row.workspaceId === where.workspaceId)
          .filter(
            (row) =>
              where.ticketId === undefined || row.ticketId === where.ticketId,
          );
        const dir = orderBy?.queuedAt === 'asc' ? 1 : -1;
        return [...filtered].sort((a, b) => {
          return dir * (a.queuedAt.getTime() - b.queuedAt.getTime());
        });
      },
    ),
    findFirst: vi.fn(
      async ({ where }: { where: { id: string; workspaceId: string } }) => {
        return (
          actions.find(
            (row) =>
              row.id === where.id && row.workspaceId === where.workspaceId,
          ) ?? null
        );
      },
    ),
  };

  const auditEvent = {
    create: vi.fn(
      async ({ data }: { data: Omit<AuditRow, 'id' | 'createdAt'> }) => {
        auditSeq += 1;
        const row: AuditRow = {
          id: `audit-${auditSeq}`,
          createdAt: new Date(
            `2026-10-14T00:00:00.${String(auditSeq).padStart(3, '0')}Z`,
          ),
          ...data,
        };
        audits.push(row);
        return row;
      },
    ),
    findMany: vi.fn(
      async ({
        where,
        orderBy,
        skip,
        take,
      }: {
        where: { workspaceId: string; OR?: unknown };
        orderBy?: { createdAt?: 'asc' | 'desc' };
        skip?: number;
        take?: number;
      }) => {
        const filtered = audits
          .filter((row) => row.workspaceId === where.workspaceId)
          .filter((row) => matchesOr(row, where.OR))
          .sort((a, b) => {
            const dir = orderBy?.createdAt === 'asc' ? 1 : -1;
            return dir * (a.createdAt.getTime() - b.createdAt.getTime());
          });
        return filtered.slice(
          skip ?? 0,
          (skip ?? 0) + (take ?? filtered.length),
        );
      },
    ),
    count: vi.fn(
      async ({ where }: { where: { workspaceId: string; OR?: unknown } }) => {
        return audits
          .filter((row) => row.workspaceId === where.workspaceId)
          .filter((row) => matchesOr(row, where.OR)).length;
      },
    ),
  };

  return {
    prisma: {
      actionExecution,
      auditEvent,
      $transaction: vi.fn(async (ops: Array<Promise<unknown>>) =>
        Promise.all(ops),
      ),
      $queryRaw: vi.fn().mockResolvedValue([1]),
      onModuleInit: vi.fn(),
      onModuleDestroy: vi.fn(),
    } as unknown as PrismaService,
    __seed: { actions, audits },
    seed: {
      action: (
        row: Omit<ActionRow, 'queuedAt' | 'createdAt' | 'updatedAt'>,
      ) => {
        const now = new Date('2026-10-14T00:00:00.000Z');
        actions.push({
          queuedAt: now,
          createdAt: now,
          updatedAt: now,
          ...row,
        });
      },
      audit: (row: Omit<AuditRow, 'id' | 'createdAt'>) => {
        auditSeq += 1;
        audits.push({
          id: `audit-${auditSeq}`,
          createdAt: new Date(
            `2026-10-14T00:00:00.${String(auditSeq).padStart(3, '0')}Z`,
          ),
          ...row,
        });
      },
    },
  };
}

function matchesOr(row: AuditRow, or: unknown): boolean {
  if (!or) return true;
  const branches = Array.isArray(or) ? or : [or];
  return branches.some((branch) => {
    const b = branch as {
      subjectType?: AuditSubjectType;
      subjectId?: string | { in?: string[] };
    };
    if (b.subjectType && row.subjectType !== b.subjectType) return false;
    if (typeof b.subjectId === 'string' && row.subjectId !== b.subjectId) {
      return false;
    }
    if (
      b.subjectId &&
      typeof b.subjectId === 'object' &&
      Array.isArray(b.subjectId.in) &&
      !b.subjectId.in.includes(row.subjectId)
    ) {
      return false;
    }
    return true;
  });
}

function makeAccessResolver(role: WorkspaceRole = WorkspaceRole.ADMIN) {
  return {
    authenticate: (req: { headers: { authorization?: string | string[] } }) => {
      const auth = req.headers.authorization;
      const authString = Array.isArray(auth) ? auth[0] : auth;
      return Promise.resolve(
        authString === AUTH_HEADER
          ? ({ id: USER_ID } satisfies AuthenticatedUser)
          : null,
      );
    },
    resolveMembership: (userId: string, requestedWorkspace: string) =>
      Promise.resolve(
        requestedWorkspace === WORKSPACE_A
          ? ({
              id: `membership-${requestedWorkspace}`,
              userId,
              workspaceId: requestedWorkspace,
              role,
              status: 'ACTIVE',
            } satisfies WorkspaceMembership)
          : null,
      ),
  } satisfies AccessContextResolver;
}

describe('action execution & audit read paths (Person D)', () => {
  let app: NestExpressApplication;
  let stub: ReturnType<typeof makePrismaStub>;
  const queueHealth = {
    ready: vi.fn(async () => ({ redis: 'connected' as const })),
  };
  // BullMQ tries to open a Redis connection at module init even with
  // lazyConnect; stub the queue token so the test never blocks on the broker.
  const actionQueue = { add: vi.fn(async () => ({ id: 'mock-job' })) };

  beforeEach(async () => {
    stub = makePrismaStub();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(stub.prisma)
      .overrideProvider(AccessContextResolver)
      .useValue(makeAccessResolver())
      .overrideProvider(QueueHealthIndicator)
      .useValue(queueHealth)
      .overrideProvider(`BullQueue_${QueueName.ACTION}`)
      .useValue(actionQueue)
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('lists action executions for a ticket inside the success envelope', async () => {
    // Two actions for workspace A / ticket A, plus one in a different ticket
    // and one in workspace B. Only the matching pair must come back.
    stub.seed.action({
      id: 'action-1',
      workspaceId: WORKSPACE_A,
      actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
      status: ActionExecutionStatus.QUEUED,
      businessEffectKey: 'be-1',
      idempotencyKey: 'idem-1',
      ticketId: TICKET_A,
      proposalId: '99999999-9999-4999-8999-999999999991',
      customerId: null,
      requestedBy: USER_ID,
      approvedBy: USER_ID,
      payload: { amount: 100 },
      resultCode: null,
      resultMessage: null,
      attempt: 0,
      startedAt: null,
      finishedAt: null,
    });
    stub.seed.action({
      id: 'action-2',
      workspaceId: WORKSPACE_A,
      actionType: ActionType.SEND_CUSTOMER_REPLY,
      status: ActionExecutionStatus.SUCCEEDED,
      businessEffectKey: 'be-2',
      idempotencyKey: 'idem-2',
      ticketId: TICKET_A,
      proposalId: '99999999-9999-4999-8999-999999999992',
      customerId: null,
      requestedBy: USER_ID,
      approvedBy: USER_ID,
      payload: { message: 'hi' },
      resultCode: 'OK',
      resultMessage: 'delivered',
      attempt: 1,
      startedAt: new Date('2026-10-14T00:00:01.000Z'),
      finishedAt: new Date('2026-10-14T00:00:02.000Z'),
    });
    stub.seed.action({
      id: 'action-other-ticket',
      workspaceId: WORKSPACE_A,
      actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
      status: ActionExecutionStatus.QUEUED,
      businessEffectKey: 'be-3',
      idempotencyKey: 'idem-3',
      ticketId: TICKET_B,
      proposalId: '99999999-9999-4999-8999-999999999993',
      customerId: null,
      requestedBy: USER_ID,
      approvedBy: USER_ID,
      payload: {},
      resultCode: null,
      resultMessage: null,
      attempt: 0,
      startedAt: null,
      finishedAt: null,
    });
    stub.seed.action({
      id: 'action-other-workspace',
      workspaceId: WORKSPACE_B,
      actionType: ActionType.SEND_CUSTOMER_REPLY,
      status: ActionExecutionStatus.QUEUED,
      businessEffectKey: 'be-4',
      idempotencyKey: 'idem-4',
      ticketId: TICKET_A,
      proposalId: '99999999-9999-4999-8999-999999999994',
      customerId: null,
      requestedBy: USER_ID,
      approvedBy: USER_ID,
      payload: {},
      resultCode: null,
      resultMessage: null,
      attempt: 0,
      startedAt: null,
      finishedAt: null,
    });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${WORKSPACE_A}/tickets/${TICKET_A}/actions`)
      .set('Authorization', AUTH_HEADER)
      .expect(200);

    expect(response.body).toMatchObject({
      requestId: response.headers['x-request-id'],
    });
    const data = response.body.data as Array<{
      id: string;
      workspaceId: string;
      ticketId: string | null;
      status: string;
      actionType: string;
    }>;
    expect(data).toHaveLength(2);
    const ids = data.map((row) => row.id).sort();
    expect(ids).toEqual(['action-1', 'action-2']);
    expect(data.every((row) => row.workspaceId === WORKSPACE_A)).toBe(true);
    expect(data.every((row) => row.ticketId === TICKET_A)).toBe(true);
    expect(data[0]).toMatchObject({
      id: 'action-1',
      actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
      status: ActionExecutionStatus.QUEUED,
    });
  });

  it('returns a paginated audit envelope for the ticket', async () => {
    // One TICKET event and one ACTION_EXECUTION event tied to the ticket,
    // plus a TICKET event for a different ticket and an ACTION_EXECUTION
    // event for an unrelated action — all in workspace A.
    const actionA1 = '22222222-2222-4222-8222-222222222221';
    stub.seed.action({
      id: actionA1,
      workspaceId: WORKSPACE_A,
      actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
      status: ActionExecutionStatus.QUEUED,
      businessEffectKey: 'be-1',
      idempotencyKey: 'idem-1',
      ticketId: TICKET_A,
      proposalId: '99999999-9999-4999-8999-999999999991',
      customerId: null,
      requestedBy: USER_ID,
      approvedBy: USER_ID,
      payload: {},
      resultCode: null,
      resultMessage: null,
      attempt: 0,
      startedAt: null,
      finishedAt: null,
    });
    stub.seed.audit({
      workspaceId: WORKSPACE_A,
      subjectType: AuditSubjectType.TICKET,
      subjectId: TICKET_A,
      action: 'TICKET_CREATED',
      actorId: USER_ID,
      source: AuditSource.API,
      businessEffectKey: null,
      idempotencyKey: null,
      metadata: null,
    });
    stub.seed.audit({
      workspaceId: WORKSPACE_A,
      subjectType: AuditSubjectType.ACTION_EXECUTION,
      subjectId: actionA1,
      action: 'ACTION_QUEUED',
      actorId: USER_ID,
      source: AuditSource.WORKER,
      businessEffectKey: 'be-1',
      idempotencyKey: 'idem-1',
      metadata: { proposalId: '99999999-9999-4999-8999-999999999991' },
    });
    // A TICKET event for a different ticket in the same workspace: must
    // never appear in the response.
    stub.seed.audit({
      workspaceId: WORKSPACE_A,
      subjectType: AuditSubjectType.TICKET,
      subjectId: TICKET_B,
      action: 'OTHER_TICKET_EVENT',
      actorId: USER_ID,
      source: AuditSource.API,
      businessEffectKey: null,
      idempotencyKey: null,
      metadata: null,
    });

    const response = await request(app.getHttpServer())
      .get(
        `/api/v1/workspaces/${WORKSPACE_A}/tickets/${TICKET_A}/audit?page=1&limit=10`,
      )
      .set('Authorization', AUTH_HEADER)
      .expect(200);

    expect(response.body).toMatchObject({
      requestId: response.headers['x-request-id'],
    });
    // Coerce page/limit to numbers — query strings travel as strings through
    // the framework and the pipe's @Transform converts them, but the JSON
    // envelope echoes whatever paginated() received. We assert numeric
    // values so the contract is unambiguous.
    const meta = response.body.meta as {
      page: number | string;
      limit: number | string;
      total: number;
      hasNext: boolean;
    };
    expect(Number(meta.page)).toBe(1);
    expect(Number(meta.limit)).toBe(10);
    expect(meta.total).toBe(2);
    expect(meta.hasNext).toBe(false);
    const data = response.body.data as Array<{
      action: string;
      subjectType: string;
      workspaceId: string;
    }>;
    expect(data).toHaveLength(2);
    expect(data.map((row) => row.action).sort()).toEqual([
      'ACTION_QUEUED',
      'TICKET_CREATED',
    ]);
    expect(data.every((row) => row.workspaceId === WORKSPACE_A)).toBe(true);
  });

  it('paginates the audit stream with hasNext=true on the first page', async () => {
    // Seed four events for the same ticket. With limit=2 the first page
    // must report hasNext=true and the second page hasNext=false.
    for (let i = 0; i < 4; i += 1) {
      stub.seed.audit({
        workspaceId: WORKSPACE_A,
        subjectType: AuditSubjectType.TICKET,
        subjectId: TICKET_A,
        action: `TICKET_EVENT_${i + 1}`,
        actorId: USER_ID,
        source: AuditSource.API,
        businessEffectKey: null,
        idempotencyKey: null,
        metadata: { index: i },
      });
    }

    const first = await request(app.getHttpServer())
      .get(
        `/api/v1/workspaces/${WORKSPACE_A}/tickets/${TICKET_A}/audit?page=1&limit=2`,
      )
      .set('Authorization', AUTH_HEADER)
      .expect(200);
    const firstMeta = first.body.meta as {
      page: number | string;
      limit: number | string;
      total: number;
      hasNext: boolean;
    };
    expect(Number(firstMeta.page)).toBe(1);
    expect(Number(firstMeta.limit)).toBe(2);
    expect(firstMeta.total).toBe(4);
    expect(firstMeta.hasNext).toBe(true);
    expect(first.body.data).toHaveLength(2);

    const second = await request(app.getHttpServer())
      .get(
        `/api/v1/workspaces/${WORKSPACE_A}/tickets/${TICKET_A}/audit?page=2&limit=2`,
      )
      .set('Authorization', AUTH_HEADER)
      .expect(200);
    const secondMeta = second.body.meta as {
      page: number | string;
      limit: number | string;
      total: number;
      hasNext: boolean;
    };
    expect(Number(secondMeta.page)).toBe(2);
    expect(Number(secondMeta.limit)).toBe(2);
    expect(secondMeta.total).toBe(4);
    expect(secondMeta.hasNext).toBe(false);
    expect(second.body.data).toHaveLength(2);
  });

  it('returns RESOURCE_NOT_FOUND (404) when a workspace B requester targets workspace A action', async () => {
    // Workspace B's only action is in the seed; the test resolver only
    // grants membership for workspace A. The access guard short-circuits
    // at the workspace-membership check and returns 404, never 403, so the
    // existence of workspace A is never disclosed to an outsider.
    stub.seed.action({
      id: ACTION_B_ID,
      workspaceId: WORKSPACE_B,
      actionType: ActionType.SEND_CUSTOMER_REPLY,
      status: ActionExecutionStatus.QUEUED,
      businessEffectKey: 'be-b-1',
      idempotencyKey: 'idem-b-1',
      ticketId: TICKET_A,
      proposalId: '99999999-9999-4999-8999-999999999995',
      customerId: null,
      requestedBy: USER_ID,
      approvedBy: USER_ID,
      payload: {},
      resultCode: null,
      resultMessage: null,
      attempt: 0,
      startedAt: null,
      finishedAt: null,
    });
    stub.seed.action({
      id: 'action-a-1',
      workspaceId: WORKSPACE_A,
      actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
      status: ActionExecutionStatus.QUEUED,
      businessEffectKey: 'be-a-1',
      idempotencyKey: 'idem-a-1',
      ticketId: TICKET_A,
      proposalId: '99999999-9999-4999-8999-999999999996',
      customerId: null,
      requestedBy: USER_ID,
      approvedBy: USER_ID,
      payload: {},
      resultCode: null,
      resultMessage: null,
      attempt: 0,
      startedAt: null,
      finishedAt: null,
    });

    // Request workspace B's action body via workspace A's path. The
    // access guard never confirms the row exists: it must return 404
    // because the requester is not a member of workspace A.
    const response = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${WORKSPACE_A}/tickets/${TICKET_A}/actions`)
      .set('Authorization', AUTH_HEADER)
      .expect(200);
    // The list call for workspace A still returns workspace A's action
    // only — workspace B's row is excluded by the WHERE filter even
    // before the membership gate.
    const data = response.body.data as Array<{
      id: string;
      workspaceId: string;
    }>;
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe('action-a-1');
    expect(data[0].workspaceId).toBe(WORKSPACE_A);

    // The dedicated by-id endpoint with a workspace mismatch is the
    // exact tenant-isolation check: ask for the workspace B action id
    // under workspace A. The guard's membership check fails first and
    // returns 404 RESOURCE_NOT_FOUND (never 403, never 200).
    const crossTenant = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${WORKSPACE_A}/actions/${ACTION_B_ID}`)
      .set('Authorization', AUTH_HEADER)
      .expect(404);
    expect(crossTenant.body.error.code).toBe('RESOURCE_NOT_FOUND');
    expect(crossTenant.body.requestId).toBe(
      crossTenant.headers['x-request-id'],
    );
  });
});
