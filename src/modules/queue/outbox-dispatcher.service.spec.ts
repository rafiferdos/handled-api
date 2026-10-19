import { Prisma } from '../../generated/prisma/client.js';
import { OutboxStatus } from '../../generated/prisma/client.js';
import type { OutboxEvent } from '../../generated/prisma/client.js';
import {
  OutboxDispatcherService,
  OUTBOX_DISPATCHER_SERVICE_OPTIONS,
  type OutboxDispatcherServiceOptions,
  backoffFor,
} from './outbox-dispatcher.service.js';

const WORKSPACE_A = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
const FIXED_INSTANCE = 'instance-fixed';
const TICK_MS = 100;
const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 30_000;

// Minimal shape of a row in the test stub. Mirrors the generated model so the
// dispatcher can read / write the same fields without runtime lookups.
type OutboxRow = {
  id: string;
  workspaceId: string;
  businessEffectKey: string;
  eventName: string;
  payload: Prisma.JsonValue;
  status: OutboxStatus;
  attempts: number;
  availableAt: Date;
  lockedBy: string | null;
  lockedUntil: Date | null;
  publishedAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  claimedAt: Date | null;
  dispatchedAt: Date | null;
  nextAttemptAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function makePrismaStub(initial: OutboxRow[]) {
  const rows: OutboxRow[] = [...initial];

  const findMany = vi.fn(
    async ({
      where,
      orderBy,
      take,
    }: {
      where: {
        status: OutboxStatus;
        availableAt: { lte: Date };
      };
      orderBy?: { availableAt: 'asc' | 'desc' };
      take?: number;
    }) => {
      const candidates = rows
        .filter(
          (row) =>
            row.status === where.status &&
            row.availableAt.getTime() <= where.availableAt.lte.getTime(),
        )
        .sort((a, b) => {
          const dir = orderBy?.availableAt === 'desc' ? -1 : 1;
          return dir * (a.availableAt.getTime() - b.availableAt.getTime());
        });
      return candidates.slice(0, take ?? candidates.length);
    },
  );

  const updateMany = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string; workspaceId: string; status: OutboxStatus };
      data: Partial<OutboxRow>;
    }) => {
      const row = rows.find(
        (r) =>
          r.id === where.id &&
          r.workspaceId === where.workspaceId &&
          r.status === where.status,
      );
      if (!row) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    },
  );

  const update = vi.fn(
    async ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<OutboxRow> & { attempts?: number };
    }) => {
      const row = rows.find((r) => r.id === where.id);
      if (!row) throw new Error(`not found: ${where.id}`);
      Object.assign(row, data);
      return { ...row };
    },
  );

  const $transaction = vi.fn(
    async (
      ops: Array<Promise<unknown>> | ((tx: unknown) => Promise<unknown>),
    ) => {
      if (Array.isArray(ops)) return Promise.all(ops);
      if (typeof ops === 'function') {
        return ops({
          outboxEvent: { findMany, updateMany, update },
        });
      }
      return ops;
    },
  );

  return {
    rows,
    outboxEvent: { findMany, updateMany, update },
    findMany,
    updateMany,
    update,
    $transaction,
  };
}

function makeQueueStub() {
  return {
    add: vi.fn(async () => ({ id: 'job-1' }) as { id: string }),
  };
}

function makeConfigStub() {
  return { get: vi.fn().mockReturnValue('') } as never;
}

function row(
  overrides: Partial<OutboxRow> & Pick<OutboxRow, 'id' | 'businessEffectKey'>,
): OutboxRow {
  return {
    workspaceId: WORKSPACE_A,
    eventName: 'action.execute',
    payload: { workspaceId: WORKSPACE_A, actionExecutionId: 'action-1' },
    status: OutboxStatus.PENDING,
    attempts: 0,
    availableAt: new Date('2026-10-14T00:00:00.000Z'),
    lockedBy: null,
    lockedUntil: null,
    publishedAt: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    claimedAt: null,
    dispatchedAt: null,
    nextAttemptAt: new Date('2026-10-14T00:00:00.000Z'),
    createdAt: new Date('2026-10-14T00:00:00.000Z'),
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
    ...overrides,
  };
}

function buildDispatcher(
  initial: OutboxRow[],
  options: {
    actionQueue?: ReturnType<typeof makeQueueStub>;
    evaluationQueue?: ReturnType<typeof makeQueueStub>;
    serviceOptions?: OutboxDispatcherServiceOptions;
  } = {},
) {
  const prisma = makePrismaStub(initial);
  const actionQueue = options.actionQueue ?? makeQueueStub();
  const evaluationQueue = options.evaluationQueue ?? makeQueueStub();
  const serviceOptions: OutboxDispatcherServiceOptions = {
    tickMs: TICK_MS,
    batchSize: BATCH_SIZE,
    maxAttempts: MAX_ATTEMPTS,
    leaseMs: LEASE_MS,
    instanceId: FIXED_INSTANCE,
    ...options.serviceOptions,
  };
  // The constructor uses @Inject(OUTBOX_DISPATCHER_SERVICE_OPTIONS), which
  // Nest satisfies at module registration time. In the unit spec we call
  // the constructor directly and pass the same token positionally so the
  // dependency wiring is exercised end-to-end.
  const dispatcher = new OutboxDispatcherService(
    prisma as never,
    makeConfigStub(),
    actionQueue as never,
    evaluationQueue as never,
    serviceOptions,
  );
  // Keep the symbol referenced so the import survives a future refactor
  // that flips the options into a true injectable provider.
  void OUTBOX_DISPATCHER_SERVICE_OPTIONS;
  return { dispatcher, prisma, actionQueue, evaluationQueue };
}

describe('OutboxDispatcherService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('claims only PENDING rows whose availableAt has elapsed, leases them, and skips siblings', async () => {
    const eligible = row({ id: '1', businessEffectKey: 'be-1' });
    const future = row({
      id: '2',
      businessEffectKey: 'be-2',
      availableAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    const alreadyProcessing = row({
      id: '3',
      businessEffectKey: 'be-3',
      status: OutboxStatus.PROCESSING,
    });
    const { dispatcher, actionQueue, prisma } = buildDispatcher([
      eligible,
      future,
      alreadyProcessing,
    ]);

    const processed = await dispatcher.tick();

    expect(processed).toBe(1);
    expect(actionQueue.add).toHaveBeenCalledTimes(1);
    expect(actionQueue.add).toHaveBeenCalledWith(
      'action.execute',
      eligible.payload,
      { jobId: `outbox:${eligible.workspaceId}:${eligible.id}` },
    );
    // The lease is the conditional update: only rows whose status was
    // PENDING at the moment of the update are claimed.
    expect(prisma.updateMany).toHaveBeenCalled();
    const updateArgs = prisma.updateMany.mock.calls[0]?.[0] as
      | {
          where: { id: string; status: OutboxStatus };
          data: Record<string, unknown>;
        }
      | undefined;
    expect(updateArgs?.where.status).toBe(OutboxStatus.PENDING);
    expect(updateArgs?.data.status).toBe(OutboxStatus.PROCESSING);
    expect(updateArgs?.data.lockedBy).toBe(FIXED_INSTANCE);
    expect(updateArgs?.data.lockedUntil).toBeInstanceOf(Date);
  });

  it('marks the row PUBLISHED with publishedAt after a successful queue.add', async () => {
    const pending = row({ id: '1', businessEffectKey: 'be-1' });
    const { dispatcher, prisma } = buildDispatcher([pending]);

    await dispatcher.tick();

    const published = prisma.rows.find((r) => r.id === '1');
    expect(published?.status).toBe(OutboxStatus.PUBLISHED);
    expect(published?.publishedAt).toBeInstanceOf(Date);
    expect(published?.lastErrorCode).toBeNull();
    expect(prisma.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: '1' },
        data: expect.objectContaining({
          status: OutboxStatus.PUBLISHED,
          publishedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('routes eventName=action.execute to the action queue and evaluation.queued to the evaluation queue', async () => {
    const actionEvent = row({
      id: '1',
      businessEffectKey: 'be-1',
      eventName: 'action.execute',
    });
    const evalEvent = row({
      id: '2',
      businessEffectKey: 'be-2',
      eventName: 'evaluation.queued',
    });
    const { dispatcher, actionQueue, evaluationQueue } = buildDispatcher([
      actionEvent,
      evalEvent,
    ]);

    await dispatcher.tick();

    expect(actionQueue.add).toHaveBeenCalledTimes(1);
    expect(actionQueue.add).toHaveBeenCalledWith(
      'action.execute',
      actionEvent.payload,
      expect.objectContaining({ jobId: `outbox:${WORKSPACE_A}:1` }),
    );
    expect(evaluationQueue.add).toHaveBeenCalledTimes(1);
    expect(evaluationQueue.add).toHaveBeenCalledWith(
      'evaluation.queued',
      evalEvent.payload,
      expect.objectContaining({ jobId: `outbox:${WORKSPACE_A}:2` }),
    );
  });

  it('uses a deterministic jobId per (workspaceId, outboxId) so duplicates are no-ops on the broker', async () => {
    const first = row({ id: 'first-id', businessEffectKey: 'be-1' });
    const second = row({ id: 'second-id', businessEffectKey: 'be-2' });
    const { dispatcher, actionQueue } = buildDispatcher([first, second]);

    await dispatcher.tick();

    const calls = actionQueue.add.mock.calls as unknown as Array<
      [string, unknown, { jobId: string }]
    >;
    const jobIds = calls.map((call) => call[2].jobId);
    expect(jobIds).toEqual([
      `outbox:${first.workspaceId}:${first.id}`,
      `outbox:${second.workspaceId}:${second.id}`,
    ]);
  });

  it('reschedules with exponential backoff when queue.add throws', async () => {
    const pending = row({ id: '1', businessEffectKey: 'be-1' });
    const actionQueue = makeQueueStub();
    actionQueue.add.mockRejectedValueOnce(new Error('redis is down'));
    const { dispatcher, prisma } = buildDispatcher([pending], { actionQueue });

    await dispatcher.tick();

    const failed = prisma.rows.find((r) => r.id === '1');
    // Stays PENDING so a later tick can re-claim the row.
    expect(failed?.status).toBe(OutboxStatus.PENDING);
    expect(failed?.attempts).toBe(1);
    expect(failed?.lastErrorCode).toBe('PUBLISH_EXCEPTION');
    expect(failed?.lastErrorMessage).toBe('redis is down');
    // availableAt moved into the future by the backoff helper.
    expect(failed?.availableAt.getTime()).toBeGreaterThan(Date.now());
    // The lease is released when the row returns to PENDING.
    expect(failed?.lockedBy).toBeNull();
    expect(failed?.lockedUntil).toBeNull();
  });

  it('marks the row FAILED once attempts reach maxAttempts and records the sanitized error', async () => {
    const pending = row({
      id: '1',
      businessEffectKey: 'be-1',
      attempts: MAX_ATTEMPTS - 1,
    });
    const actionQueue = makeQueueStub();
    actionQueue.add.mockRejectedValueOnce(new Error('still broken'));
    const { dispatcher, prisma } = buildDispatcher([pending], { actionQueue });

    await dispatcher.tick();

    const failed = prisma.rows.find((r) => r.id === '1');
    expect(failed?.status).toBe(OutboxStatus.FAILED);
    expect(failed?.attempts).toBe(MAX_ATTEMPTS);
    expect(failed?.lastErrorCode).toBe('PUBLISH_EXCEPTION');
    expect(failed?.lastErrorMessage).toBe('still broken');
    // The lease is released on the FAILED transition so an operator can
    // manually re-enqueue the row without a lease collision.
    expect(failed?.lockedBy).toBeNull();
    expect(failed?.lockedUntil).toBeNull();
  });

  it('parses an AppException code into lastErrorCode instead of the generic PUBLISH_EXCEPTION', async () => {
    const pending = row({ id: '1', businessEffectKey: 'be-1' });
    const { AppException } =
      await import('../../common/errors/app.exception.js');
    const { ErrorCode } = await import('../../common/errors/error-codes.js');
    const actionQueue = makeQueueStub();
    actionQueue.add.mockRejectedValueOnce(
      new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE),
    );
    const { dispatcher, prisma } = buildDispatcher([pending], { actionQueue });

    await dispatcher.tick();

    const failed = prisma.rows.find((r) => r.id === '1');
    expect(failed?.lastErrorCode).toBe(ErrorCode.DEPENDENCY_UNAVAILABLE);
  });

  it('parks the row in FAILED immediately when the event name is unknown', async () => {
    const unknown = row({
      id: '1',
      businessEffectKey: 'be-1',
      eventName: 'something.else',
    });
    const { dispatcher, prisma, actionQueue, evaluationQueue } =
      buildDispatcher([unknown]);

    await dispatcher.tick();

    const failed = prisma.rows.find((r) => r.id === '1');
    expect(failed?.status).toBe(OutboxStatus.FAILED);
    expect(failed?.attempts).toBe(1);
    expect(failed?.lastErrorCode).toBe('UNKNOWN_EVENT_NAME');
    expect(failed?.lastErrorMessage).toContain('something.else');
    // No queue was touched for an unknown event name.
    expect(actionQueue.add).not.toHaveBeenCalled();
    expect(evaluationQueue.add).not.toHaveBeenCalled();
  });

  it('does not process rows whose availableAt is in the future', async () => {
    const future = row({
      id: '1',
      businessEffectKey: 'be-1',
      availableAt: new Date('2099-01-01T00:00:00.000Z'),
    });
    const { dispatcher, actionQueue } = buildDispatcher([future]);

    expect(await dispatcher.tick()).toBe(0);
    expect(actionQueue.add).not.toHaveBeenCalled();
  });

  it('does not process rows that are already leased by a sibling dispatcher', async () => {
    const leased = row({
      id: '1',
      businessEffectKey: 'be-1',
      status: OutboxStatus.PROCESSING,
      lockedBy: 'sibling',
      lockedUntil: new Date(Date.now() + 60_000),
    });
    const { dispatcher, actionQueue } = buildDispatcher([leased]);

    expect(await dispatcher.tick()).toBe(0);
    expect(actionQueue.add).not.toHaveBeenCalled();
  });

  it('returns 0 when no candidates exist (empty table)', async () => {
    const { dispatcher, actionQueue } = buildDispatcher([]);
    expect(await dispatcher.tick()).toBe(0);
    expect(actionQueue.add).not.toHaveBeenCalled();
  });
});

describe('backoffFor', () => {
  it('grows exponentially and caps at 5 minutes', () => {
    expect(backoffFor(1)).toBe(1_000 * 2);
    expect(backoffFor(2)).toBe(1_000 * 4);
    expect(backoffFor(3)).toBe(1_000 * 8);
    // 2^20 minutes = 1_048_576_000ms which is well above the 5-minute cap.
    expect(backoffFor(20)).toBe(5 * 60_000);
  });
});

// Suppress "type defined but never used" noise for the typed import that only
// appears in JSDoc above.
type _OutboxEvent = OutboxEvent;
