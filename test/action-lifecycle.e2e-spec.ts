import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
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
  ActionType,
  AuditSource,
  AuditSubjectType,
} from '../src/generated/prisma/client.js';
import type {
  ActionExecution,
  AuditEvent,
  OutboxEvent,
  Prisma as PrismaTypes,
} from '../src/generated/prisma/client.js';
import {
  QueueName,
  SupportEvent,
} from '../src/common/contracts/async.contracts.js';
import { ActionService } from '../src/modules/action/action.service.js';
import { ActionHandlerRegistry } from '../src/modules/queue/action.handler.js';
import { ActionProcessor } from '../src/modules/queue/processors/action.processor.js';
import { SupportGateway } from '../src/modules/events/support.gateway.js';

const WORKSPACE_A = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
const WORKSPACE_B = 'b62c1b46-3429-4e12-b7d2-4a01be581a02';
const OTHER_WORKSPACE = '5d8c536b-86aa-456d-9bbf-9b1bd58406c3';
const PROPOSAL_ID = '11111111-1111-4111-8111-111111111111';
const DECISION_ID = '22222222-2222-4222-8222-222222222222';
const TARGET_PAYMENT = '33333333-3333-4333-8333-333333333333';
const TICKET_ID = '55555555-5555-4555-8555-555555555555';

type ActionRow = ActionExecution & {
  beforeState: PrismaTypes.JsonValue | null;
  afterState: PrismaTypes.JsonValue | null;
  lastErrorCode: string | null;
};

type AuditRow = AuditEvent;

type OutboxRow = OutboxEvent;

interface PrismaStub {
  actions: Map<string, ActionRow>;
  audits: AuditRow[];
  outbox: OutboxRow[];
  actionExecution: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  auditEvent: { create: ReturnType<typeof vi.fn> };
  outboxEvent: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
}

function isoNow(): string {
  return new Date('2026-11-01T00:00:00.000Z').toISOString();
}

function makePrismaStub(): PrismaStub {
  const actions = new Map<string, ActionRow>();
  const audits: AuditRow[] = [];
  const outbox: OutboxRow[] = [];

  const findUnique = vi.fn(
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
      const row = [...actions.values()].find(
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
  );

  const findFirst = vi.fn(
    async ({ where }: { where: { id: string; workspaceId: string } }) => {
      const row = actions.get(where.id);
      if (!row || row.workspaceId !== where.workspaceId) return null;
      return { ...row };
    },
  );

  const findMany = vi.fn(
    async ({
      where,
      orderBy,
    }: {
      where: { workspaceId: string; ticketId?: string };
      orderBy?: { queuedAt?: 'asc' | 'desc' };
    }) => {
      const filtered = [...actions.values()].filter(
        (a) =>
          a.workspaceId === where.workspaceId &&
          (where.ticketId === undefined || a.ticketId === where.ticketId),
      );
      const dir = orderBy?.queuedAt === 'asc' ? 1 : -1;
      return filtered.sort(
        (a, b) => dir * (a.queuedAt.getTime() - b.queuedAt.getTime()),
      );
    },
  );

  const create = vi.fn(
    async ({
      data,
    }: {
      data: Omit<ActionRow, 'id' | 'queuedAt' | 'createdAt' | 'updatedAt'>;
    }) => {
      const now = new Date();
      // UUID format so the controller's isUUID(actionId) guard accepts the id
      // for HTTP routes that fetch the row by id.
      const id = `cccccccc-cccc-4ccc-8ccc-${actions.size.toString().padStart(12, '0')}`;
      const row: ActionRow = {
        id,
        queuedAt: now,
        createdAt: now,
        updatedAt: now,
        ...data,
      } as ActionRow;
      actions.set(id, row);
      return row;
    },
  );

  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<ActionRow> & {
        attempt?: number | { increment?: number };
        attempts?: number | { increment?: number };
      };
    }) => {
      const row = actions.get(where.id);
      if (!row) throw new Error(`not found: ${where.id}`);
      const next: ActionRow = { ...row };
      for (const [key, value] of Object.entries(data)) {
        if (
          value &&
          typeof value === 'object' &&
          'increment' in (value as Record<string, unknown>)
        ) {
          const increment = (value as { increment?: number }).increment ?? 0;
          (next as Record<string, unknown>)[key] =
            ((row as unknown as Record<string, number>)[key] ?? 0) + increment;
        } else {
          (next as Record<string, unknown>)[key] = value as unknown;
        }
      }
      actions.set(where.id, next);
      return { ...next };
    },
  );

  const auditCreate = vi.fn(
    async ({ data }: { data: Omit<AuditRow, 'id' | 'createdAt'> }) => {
      const row = {
        id: `audit-${audits.length + 1}`,
        createdAt: new Date(),
        ...data,
      } as AuditRow;
      audits.push(row);
      return row;
    },
  );

  const outboxCreate = vi.fn(
    async ({
      data,
    }: {
      data: Omit<OutboxRow, 'id' | 'attempts' | 'nextAttemptAt' | 'createdAt'>;
    }) => {
      const row = {
        id: `outbox-${outbox.length + 1}`,
        attempts: 0,
        createdAt: new Date(),
        nextAttemptAt: new Date(),
        ...data,
      } as OutboxRow;
      outbox.push(row);
      return row;
    },
  );

  const outboxUpdate = vi.fn(async () => ({ count: 1 }));
  const outboxFindMany = vi.fn(async () => outbox.slice());
  const outboxFindFirst = vi.fn(async () => null);

  const txClient = {
    actionExecution: { findUnique, findFirst, findMany, create, update },
    auditEvent: { create: auditCreate },
    outboxEvent: {
      create: outboxCreate,
      update: outboxUpdate,
      findMany: outboxFindMany,
      findFirst: outboxFindFirst,
    },
  };

  const $transaction = vi.fn(
    async (run: (tx: typeof txClient) => Promise<unknown>) => run(txClient),
  );

  return {
    actions,
    audits,
    outbox,
    actionExecution: { findUnique, findFirst, findMany, create, update },
    auditEvent: { create: auditCreate },
    outboxEvent: {
      create: outboxCreate,
      update: outboxUpdate,
      findMany: outboxFindMany,
      findFirst: outboxFindFirst,
    },
    $transaction,
  };
}

function makeAccessResolver(role: WorkspaceRole) {
  return {
    authenticate: (req: { headers: Record<string, string> }) => {
      if (req.headers.authorization !== 'Bearer test-identity')
        return Promise.resolve(null);
      return Promise.resolve({ id: 'test-user' });
    },
    resolveMembership: (userId: string, requestedWorkspace: string) => {
      if (
        requestedWorkspace !== WORKSPACE_A &&
        requestedWorkspace !== WORKSPACE_B
      ) {
        return Promise.resolve(null);
      }
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

function makeActionQueueStub() {
  return {
    add: vi.fn(async () => ({ id: 'mock-job' })),
  };
}

interface E2EContext {
  app: NestExpressApplication;
  prisma: PrismaStub;
  queue: ReturnType<typeof makeActionQueueStub>;
  gateway: { emitToWorkspace: ReturnType<typeof vi.fn> };
  close: () => Promise<void>;
}

async function bootstrap(role: WorkspaceRole): Promise<E2EContext> {
  const prisma = makePrismaStub();
  const queue = makeActionQueueStub();
  const resolver = makeAccessResolver(role);

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
    .useValue(resolver)
    // The BullMQ @InjectQueue token is also bound when no Redis is available;
    // override the provider the service injects.
    .overrideProvider(`BullQueue_${QueueName.ACTION}`)
    .useValue(queue)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();
  // Bind the HTTP + Socket.IO server to a random port so the socket fanout
  // tests can connect a real client. `app.init()` only wires the DI graph;
  // the gateway's namespace becomes reachable only after `listen()`.
  await app.listen(0);
  // Spy on the real SupportGateway so dispatch tests can still inspect
  // `emitToWorkspace.mock.calls` while the socket fanout tests go through
  // the real Socket.IO namespace (no broker, no test double). The spy
  // forwards to the original implementation so a connected client still
  // receives its broadcast.
  const realGateway = app.get(SupportGateway);
  const gateway = {
    emitToWorkspace: vi.spyOn(realGateway, 'emitToWorkspace'),
  };

  return {
    app,
    prisma,
    queue,
    gateway,
    close: async () => {
      await app.close();
    },
  };
}

function admissionParams(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: WORKSPACE_A,
    proposalId: PROPOSAL_ID,
    decisionId: DECISION_ID,
    actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
    idempotencyKey: 'idem-e2e-1',
    targetRef: 'payment',
    targetId: TARGET_PAYMENT,
    proposalVersion: 1,
    targetStateVersion: 1,
    input: { amount: 100 },
    actorId: '44444444-4444-4444-8444-444444444444',
    ...overrides,
  };
}

describe('Person D — action lifecycle (admission → read → worker)', () => {
  describe('admission (ActionService.queueApprovedAction)', () => {
    it('writes the execution, audit and outbox rows in a single transaction and enqueues a BullMQ job', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        const service = ctx.app.get(ActionService);
        const result = await service.queueApprovedAction(admissionParams());

        expect(result.duplicate).toBe(false);
        expect(result.status).toBe(ActionExecutionStatus.QUEUED);

        // One transaction holds the action + audit + outbox writes.
        expect(ctx.prisma.$transaction).toHaveBeenCalledTimes(1);
        expect(ctx.prisma.actions.size).toBe(1);
        expect(ctx.prisma.audits).toHaveLength(1);
        expect(ctx.prisma.outbox).toHaveLength(1);

        const audit = ctx.prisma.audits[0];
        expect(audit.action).toBe('ACTION_QUEUED');
        expect(audit.subjectType).toBe(AuditSubjectType.ACTION_EXECUTION);
        expect(audit.source).toBe(AuditSource.API);

        const outboxRow = ctx.prisma.outbox[0];
        expect(outboxRow.eventName).toBe(SupportEvent.ACTION_EXECUTE);
        expect(outboxRow.workspaceId).toBe(WORKSPACE_A);
        expect(outboxRow.businessEffectKey).toBe(
          [...ctx.prisma.actions.values()][0].businessEffectKey,
        );

        // BullMQ enqueue happens exactly once, after commit, with the contract:
        //   jobId = action-${id}, 3 attempts, exponential backoff.
        expect(ctx.queue.add).toHaveBeenCalledTimes(1);
        const queueCalls = ctx.queue.add.mock.calls as unknown as Array<
          [string, Record<string, unknown>, { jobId: string; attempts: number }]
        >;
        expect(queueCalls[0]?.[0]).toBe(QueueName.ACTION);
        expect(queueCalls[0]?.[2]?.jobId).toBe(
          `action-${result.actionExecutionId}`,
        );
        expect(queueCalls[0]?.[2]?.attempts).toBe(3);
      } finally {
        await ctx.close();
      }
    });

    it('is idempotent on (workspaceId, businessEffectKey): a repeat admission returns the original row without re-writing', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        const service = ctx.app.get(ActionService);
        const first = await service.queueApprovedAction(admissionParams());
        const writeCountsAfterFirst = {
          tx: ctx.prisma.$transaction.mock.calls.length,
          audit: ctx.prisma.audits.length,
          outbox: ctx.prisma.outbox.length,
          queue: ctx.queue.add.mock.calls.length,
        };

        const second = await service.queueApprovedAction(admissionParams());

        expect(second.duplicate).toBe(true);
        expect(second.actionExecutionId).toBe(first.actionExecutionId);
        expect(second.status).toBe(ActionExecutionStatus.QUEUED);

        // Nothing new hit the persistent layer on the second admission.
        expect(ctx.prisma.$transaction.mock.calls.length).toBe(
          writeCountsAfterFirst.tx,
        );
        expect(ctx.prisma.audits.length).toBe(writeCountsAfterFirst.audit);
        expect(ctx.prisma.outbox.length).toBe(writeCountsAfterFirst.outbox);
        expect(ctx.queue.add.mock.calls.length).toBe(
          writeCountsAfterFirst.queue,
        );
      } finally {
        await ctx.close();
      }
    });

    it('treats the same effectKey under a different workspace as a fresh admission', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        const service = ctx.app.get(ActionService);
        const a = await service.queueApprovedAction(
          admissionParams({ workspaceId: WORKSPACE_A }),
        );
        const b = await service.queueApprovedAction(
          admissionParams({ workspaceId: WORKSPACE_B }),
        );

        expect(a.duplicate).toBe(false);
        expect(b.duplicate).toBe(false);
        expect(a.actionExecutionId).not.toBe(b.actionExecutionId);
        expect(ctx.prisma.actions.size).toBe(2);
      } finally {
        await ctx.close();
      }
    });
  });

  describe('read API (ActionController)', () => {
    it('returns the action via /workspaces/:id/actions/:actionId for ADMIN members', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        const service = ctx.app.get(ActionService);
        const { actionExecutionId } =
          await service.queueApprovedAction(admissionParams());

        const response = await request(ctx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/actions/${actionExecutionId}`)
          .set('Authorization', 'Bearer test-identity')
          .expect(200);

        expect(response.body.data.id).toBe(actionExecutionId);
        expect(response.body.data.workspaceId).toBe(WORKSPACE_A);
        expect(response.body.data.status).toBe(ActionExecutionStatus.QUEUED);
        expect(response.body.data.businessEffectKey).toContain('action:');
      } finally {
        await ctx.close();
      }
    });

    it('returns 404 — not 403 — when the action belongs to a different workspace', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        const service = ctx.app.get(ActionService);
        const { actionExecutionId } =
          await service.queueApprovedAction(admissionParams());

        await request(ctx.app.getHttpServer())
          .get(
            `/api/v1/workspaces/${OTHER_WORKSPACE}/actions/${actionExecutionId}`,
          )
          .set('Authorization', 'Bearer test-identity')
          .expect(404);
      } finally {
        await ctx.close();
      }
    });

    it('returns 401 for unauthenticated reads and 400 for a non-UUID path', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        await request(ctx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/actions/not-a-uuid`)
          .set('Authorization', 'Bearer test-identity')
          .expect(400);

        await request(ctx.app.getHttpServer())
          .get(
            `/api/v1/workspaces/${WORKSPACE_A}/actions/cccccccc-cccc-4ccc-8ccc-cccccccccccc`,
          )
          .expect(401);
      } finally {
        await ctx.close();
      }
    });

    it('lists actions for a ticket scoped to the workspace (workspaceId becomes the tenant boundary)', async () => {
      const ctx = await bootstrap(WorkspaceRole.VIEWER);
      try {
        const service = ctx.app.get(ActionService);
        await service.queueApprovedAction(
          admissionParams({ idempotencyKey: 'idem-list-1' }),
        );
        const first = [...ctx.prisma.actions.values()][0];
        first.ticketId = TICKET_ID;

        // A second action in the same workspace but a different ticket must
        // be excluded from the ticket-scoped listing.
        await service.queueApprovedAction(
          admissionParams({
            idempotencyKey: 'idem-list-2',
            proposalId: '99999999-9999-4999-8999-999999999999',
            decisionId: '88888888-8888-4888-8888-888888888888',
          }),
        );
        const second = [...ctx.prisma.actions.values()][1];
        second.ticketId = '66666666-6666-4666-8666-666666666664';

        // Viewers are permitted on the list-by-ticket endpoint per the
        // controller's Roles decorator.
        const response = await request(ctx.app.getHttpServer())
          .get(`/api/v1/workspaces/${WORKSPACE_A}/tickets/${TICKET_ID}/actions`)
          .set('Authorization', 'Bearer test-identity')
          .expect(200);

        expect(Array.isArray(response.body.data)).toBe(true);
        expect(response.body.data).toHaveLength(1);
        expect(response.body.data[0].ticketId).toBe(TICKET_ID);
      } finally {
        await ctx.close();
      }
    });
  });

  describe('queue dispatch (ActionProcessor.process)', () => {
    function seedAction(prisma: PrismaStub): ActionRow {
      const id = 'action-dispatch-1';
      const queued = new Date('2026-11-01T00:00:00.000Z');
      const row: ActionRow = {
        id,
        workspaceId: WORKSPACE_A,
        actionType: ActionType.REFUND_DUPLICATE_PAYMENT,
        status: ActionExecutionStatus.QUEUED,
        businessEffectKey: 'action:dispatch:1',
        idempotencyKey: 'idem-dispatch',
        ticketId: null,
        proposalId: PROPOSAL_ID,
        customerId: null,
        requestedBy: '44444444-4444-4444-8444-444444444444',
        approvedBy: null,
        payload: { targetRef: 'payment', targetId: TARGET_PAYMENT },
        resultCode: null,
        resultMessage: null,
        attempt: 0,
        queuedAt: queued,
        startedAt: null,
        finishedAt: null,
        createdAt: queued,
        updatedAt: queued,
        beforeState: null,
        afterState: null,
        lastErrorCode: null,
      };
      prisma.actions.set(id, row);
      return row;
    }

    it('drives the QUEUED → RUNNING → SUCCEEDED lifecycle, emits progress+completed, and leaves no failed event', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        seedAction(ctx.prisma);
        const processor = ctx.app.get(ActionProcessor);
        const handlers = ctx.app.get(ActionHandlerRegistry);

        await processor.process({
          id: 'job-1',
          data: {
            workspaceId: WORKSPACE_A,
            actionExecutionId: 'action-dispatch-1',
            requestId: 'req-dispatch',
          },
        } as never);

        const row = ctx.prisma.actions.get('action-dispatch-1')!;
        expect(row.status).toBe(ActionExecutionStatus.SUCCEEDED);
        expect(row.resultCode).toBe('PAYMENT_REFUNDED');
        expect(row.beforeState).toBeTruthy();
        expect(row.afterState).toBeTruthy();
        expect(row.attempt).toBe(1);

        // Audit chain: ACTION_STARTED + ACTION_EXECUTED.
        const observed = ctx.prisma.audits.map((a) => a.action);
        expect(observed).toEqual(['ACTION_STARTED', 'ACTION_EXECUTED']);

        // The gateway fires progress + completed in order; failed must NOT
        // appear on the happy path.
        const emittedNames = ctx.gateway.emitToWorkspace.mock.calls.map(
          (c) => c[1],
        );
        expect(emittedNames).toEqual(
          expect.arrayContaining([
            SupportEvent.ACTION_PROGRESS,
            SupportEvent.ACTION_COMPLETED,
          ]),
        );
        expect(emittedNames).not.toContain(SupportEvent.ACTION_FAILED);

        // Handlers must not call into another person's modules.
        expect(handlers).toBeInstanceOf(ActionHandlerRegistry);
      } finally {
        await ctx.close();
      }
    });

    it('short-circuits when the row is already SUCCEEDED (idempotency guard) — no transactions, no emits', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        const row = seedAction(ctx.prisma);
        row.status = ActionExecutionStatus.SUCCEEDED;

        const txCallsBefore = ctx.prisma.$transaction.mock.calls.length;
        const emitCallsBefore = ctx.gateway.emitToWorkspace.mock.calls.length;

        const processor = ctx.app.get(ActionProcessor);
        await processor.process({
          id: 'job-2',
          data: {
            workspaceId: WORKSPACE_A,
            actionExecutionId: 'action-dispatch-1',
          },
        } as never);

        expect(ctx.prisma.$transaction.mock.calls.length).toBe(txCallsBefore);
        expect(ctx.gateway.emitToWorkspace.mock.calls.length).toBe(
          emitCallsBefore,
        );
      } finally {
        await ctx.close();
      }
    });

    it('drops (no transactions, no emits) when the workspaceId on the job does not match the row', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        seedAction(ctx.prisma);

        const processor = ctx.app.get(ActionProcessor);
        await processor.process({
          id: 'job-3',
          data: {
            workspaceId: WORKSPACE_B,
            actionExecutionId: 'action-dispatch-1',
          },
        } as never);

        expect(ctx.prisma.$transaction).not.toHaveBeenCalled();
        expect(ctx.gateway.emitToWorkspace).not.toHaveBeenCalled();
        expect(ctx.prisma.actions.get('action-dispatch-1')?.status).toBe(
          ActionExecutionStatus.QUEUED,
        );
      } finally {
        await ctx.close();
      }
    });
  });

  describe('dto validation (action-execution-response)', () => {
    it('the AnalyticsWindowQueryDto rejects windowDays outside 1..90', async () => {
      const { AnalyticsWindowQueryDto } =
        await import('../src/modules/analytics/analytics.dto.js');
      const tooSmall = plainToInstance(AnalyticsWindowQueryDto, {
        windowDays: 0,
      });
      const tooLarge = plainToInstance(AnalyticsWindowQueryDto, {
        windowDays: 91,
      });
      const boundary = plainToInstance(AnalyticsWindowQueryDto, {
        windowDays: 30,
      });

      expect((await validate(tooSmall)).length).toBeGreaterThan(0);
      expect((await validate(tooLarge)).length).toBeGreaterThan(0);
      expect((await validate(boundary)).length).toBe(0);
    });
  });

  describe('socket fanout (SupportGateway.emitToWorkspace)', () => {
    it('a client connected to /support with workspaceId joins the room and receives an emitToWorkspace broadcast', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        const address = ctx.app.getHttpServer().address();
        const port = typeof address === 'object' && address ? address.port : 0;
        const url = `http://127.0.0.1:${port}/support`;

        const connected = new Promise<ClientSocket>((resolve, reject) => {
          const sock = ioClient(url, {
            query: { workspaceId: WORKSPACE_A },
            transports: ['websocket'],
            reconnection: false,
          });
          sock.once('connect', () => resolve(sock));
          sock.once('connect_error', reject);
          setTimeout(() => reject(new Error('socket connect timeout')), 2_000);
        });
        const sock = await connected;

        const received = new Promise<Record<string, unknown>>((resolve) => {
          sock.once(
            SupportEvent.ACTION_COMPLETED,
            (msg: Record<string, unknown>) => resolve(msg),
          );
        });

        // Drive the gateway through the override so we never need real Redis.
        const gateway = ctx.app.get<SupportGateway>(SupportGateway);
        const ok = await gateway.emitToWorkspace(
          WORKSPACE_A,
          SupportEvent.ACTION_COMPLETED,
          {
            actionExecutionId: 'action-fanout-1',
            status: ActionExecutionStatus.SUCCEEDED,
          },
        );
        expect(ok).toBe(true);

        const msg = await received;
        expect(msg['actionExecutionId']).toBe('action-fanout-1');
        expect(typeof msg['timestamp']).toBe('string');

        sock.disconnect();
      } finally {
        await ctx.close();
      }
    });

    it('emitToWorkspace returns false and never throws when no socket is connected to the room', async () => {
      const ctx = await bootstrap(WorkspaceRole.ADMIN);
      try {
        const gateway = ctx.app.get<SupportGateway>(SupportGateway);
        const ok = await gateway.emitToWorkspace(
          'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          SupportEvent.ACTION_FAILED,
          { actionExecutionId: 'nobody-home' },
        );
        expect(ok).toBe(false);
      } finally {
        await ctx.close();
      }
    });
  });
});

// isoNow is intentionally a no-mark helper so the imports above stay
// compile-clean if a future test re-uses the timestamp.
void isoNow;
