import { randomUUID } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { Prisma } from '../../generated/prisma/client.js';
import { OutboxStatus } from '../../generated/prisma/client.js';
import type { OutboxEvent } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { QueueName } from '../../common/contracts/async.contracts.js';

/**
 * Injection token for the dispatcher options (timers, instance id, batch
 * size, etc.). Tests and operators can override the defaults by providing
 * a custom `OutboxDispatcherServiceOptions` value at module registration.
 */
export const OUTBOX_DISPATCHER_SERVICE_OPTIONS = Symbol(
  'OutboxDispatcherServiceOptions',
);

/**
 * Polling interval (ms) for the durable outbox recovery loop. The realtime
 * emitter (queue/outbox.dispatcher.ts) is event-driven via BullMQ enqueue
 * calls; this service is the backstop that re-publishes rows that never made
 * it to the broker (worker crash, Redis reconnect, app restart mid-publish).
 */
export const OUTBOX_DISPATCHER_SERVICE_TICK_MS = 5_000;

/**
 * Maximum rows pulled per tick. Keeps each cycle short so a backlog of
 * thousands of rows does not block the loop. The next tick picks up the
 * remainder.
 */
export const OUTBOX_DISPATCHER_SERVICE_BATCH = 25;

/**
 * Maximum publish attempts per row before the row is parked in FAILED.
 * Distinct from the realtime emitter's MAX_ATTEMPTS so the two dispatchers
 * do not share a retry budget.
 */
export const OUTBOX_DISPATCHER_SERVICE_MAX_ATTEMPTS = 8;

/**
 * Lease duration (ms). While a row is leased it is owned by a single
 * dispatcher instance; any other instance that sees the row will skip it
 * because the conditional claim only succeeds for PENDING rows. The lease
 * is mainly a debugging aid + future reclaim path; the conditional PENDING
 * claim is the real correctness guard.
 */
export const OUTBOX_DISPATCHER_SERVICE_LEASE_MS = 30_000;

/**
 * Event names routed to the BullMQ action queue. The action producer uses
 * `action.execute` (see SupportEvent.ACTION_EXECUTE). Anything outside this
 * set falls through to the evaluation queue.
 */
const ACTION_EVENT_NAMES = new Set<string>(['action.execute']);

/**
 * Event names routed to the BullMQ evaluation queue. Matches the lead's
 * evaluation producer conventions; unknown event names fail the row so it
 * is parked in FAILED rather than silently dropped.
 */
const EVALUATION_EVENT_NAMES = new Set<string>(['evaluation.queued']);

export type OutboxQueueName =
  typeof QueueName.ACTION | typeof QueueName.EVALUATION;

export interface OutboxDispatcherServiceOptions {
  /** Overrides for the various timers. Tests use these to make the loop
   *  synchronous; production should leave the defaults. */
  tickMs?: number;
  batchSize?: number;
  maxAttempts?: number;
  leaseMs?: number;
  /** Stable id used as the `lockedBy` value. Tests can pin it for
   *  assertions; production gets a per-instance UUID. */
  instanceId?: string;
}

/**
 * Durable outbox recovery (Person D). This service polls the database
 * outbox, leases each PENDING row whose `availableAt` has elapsed, and
 * publishes the payload to a BullMQ queue (`action` or `evaluation`) with
 * a deterministic `jobId` so a duplicate enqueue is a no-op on the broker
 * side.
 *
 * Lifecycle per row:
 *   1. Conditional claim: `UPDATE ... WHERE id = ? AND status = PENDING` to
 *      transition the row to PROCESSING and stamp `lockedBy` / `lockedUntil`.
 *      Two dispatcher instances will race here; only one of the conditional
 *      updates will report count=1, the other is skipped.
 *   2. Pick the target queue by event name. Unknown event names park the
 *      row in FAILED so the row never silently disappears.
 *   3. `queue.add(name, payload, { jobId: deterministic })`. A failure here
 *      increments `attempts`, records `lastErrorCode` / `lastErrorMessage`,
 *      and either flips the row to FAILED (attempts >= maxAttempts) or
 *      returns it to PENDING with an exponential `availableAt`.
 *   4. On success: status=PUBLISHED, publishedAt=now(). The durable handoff
 *      is complete; BullMQ owns the row from here on.
 */
@Injectable()
export class OutboxDispatcherService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private readonly tickMs: number;
  private readonly batchSize: number;
  private readonly maxAttempts: number;
  private readonly leaseMs: number;
  private readonly instanceId: string;
  private timer?: NodeJS.Timeout;
  private stopped = false;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) private readonly config: ConfigService,
    @InjectQueue(QueueName.ACTION)
    private readonly actionQueue: Pick<Queue, 'add'>,
    @InjectQueue(QueueName.EVALUATION)
    private readonly evaluationQueue: Pick<Queue, 'add'>,
    @Inject(OUTBOX_DISPATCHER_SERVICE_OPTIONS)
    options: OutboxDispatcherServiceOptions = {},
  ) {
    this.tickMs = options.tickMs ?? OUTBOX_DISPATCHER_SERVICE_TICK_MS;
    this.batchSize = options.batchSize ?? OUTBOX_DISPATCHER_SERVICE_BATCH;
    this.maxAttempts =
      options.maxAttempts ?? OUTBOX_DISPATCHER_SERVICE_MAX_ATTEMPTS;
    this.leaseMs = options.leaseMs ?? OUTBOX_DISPATCHER_SERVICE_LEASE_MS;
    this.instanceId = options.instanceId ?? randomUUID();
  }

  onModuleInit(): void {
    if (this.stopped) return;
    // Even when REDIS_URL is empty the dispatcher service can run: it claims
    // and updates the database outbox row. The actual `queue.add()` call will
    // fail with the NOOP_QUEUE stub and the row will be retried on the next
    // tick. Tests that wire a real broker get a fully functional loop.
    this.timer = setInterval(
      () => this.tick().catch((err: unknown) => this.handleTickError(err)),
      this.tickMs,
    );
    this.timer.unref?.();
  }

  async onApplicationShutdown(): Promise<void> {
    this.stopped = true;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * One polling cycle. Returns the number of rows that were successfully
   * leased + processed in this tick. Errors are swallowed here so the timer
   * keeps running; the rows stay in their previous status.
   */
  async tick(): Promise<number> {
    const claimed = await this.claimBatch();
    if (claimed.length === 0) return 0;
    for (const row of claimed) {
      await this.publishRow(row);
    }
    return claimed.length;
  }

  /**
   * Claim a batch of PENDING rows whose `availableAt` has elapsed. The
   * conditional `updateMany` is the actual lease: only one dispatcher
   * instance sees `count=1`, the others see `count=0` and skip the row.
   */
  private async claimBatch(): Promise<OutboxEvent[]> {
    return this.prisma.$transaction(async (tx) => {
      const candidates = await tx.outboxEvent.findMany({
        where: {
          status: OutboxStatus.PENDING,
          availableAt: { lte: new Date() },
        },
        orderBy: { availableAt: 'asc' },
        take: this.batchSize,
      });
      const claimed: OutboxEvent[] = [];
      const now = new Date();
      const leaseUntil = new Date(now.getTime() + this.leaseMs);
      for (const candidate of candidates) {
        const updated = await tx.outboxEvent.updateMany({
          where: {
            id: candidate.id,
            workspaceId: candidate.workspaceId,
            status: OutboxStatus.PENDING,
          },
          data: {
            status: OutboxStatus.PROCESSING,
            lockedBy: this.instanceId,
            lockedUntil: leaseUntil,
            claimedAt: now,
          },
        });
        if (updated.count === 1) {
          claimed.push({
            ...candidate,
            status: OutboxStatus.PROCESSING,
            lockedBy: this.instanceId,
            lockedUntil: leaseUntil,
            claimedAt: now,
          });
        }
      }
      return claimed;
    });
  }

  /**
   * Publish a single claimed row. Picks the target queue by event name,
   * enqueues with a deterministic `jobId` so a retried lease is a no-op on
   * the broker side, then advances the row to PUBLISHED or back to PENDING
   * (with exponential backoff) on failure.
   */
  private async publishRow(row: OutboxEvent): Promise<void> {
    const target = this.resolveQueue(row.eventName);
    if (!target) {
      await this.markFailedUnknownEvent(row);
      return;
    }
    const queue = this.queueFor(target);
    const jobId = this.jobIdFor(row);
    try {
      await queue.add(row.eventName, row.payload, { jobId });
      await this.markPublished(row.id);
    } catch (err) {
      await this.retryOrFail(row, err);
    }
  }

  /**
   * Map an `eventName` to the target queue name. `null` means the event
   * name is unknown to this dispatcher; the row is parked in FAILED so it
   * does not silently loop forever.
   */
  private resolveQueue(eventName: string): OutboxQueueName | null {
    if (ACTION_EVENT_NAMES.has(eventName)) return QueueName.ACTION;
    if (EVALUATION_EVENT_NAMES.has(eventName)) return QueueName.EVALUATION;
    return null;
  }

  private queueFor(name: OutboxQueueName): Pick<Queue, 'add'> {
    return name === QueueName.ACTION ? this.actionQueue : this.evaluationQueue;
  }

  /**
   * Deterministic BullMQ `jobId`. BullMQ deduplicates against this id, so
   * a duplicate lease of the same outbox row (a crashed dispatcher whose
   * lease expired) will not enqueue a second job.
   */
  private jobIdFor(row: OutboxEvent): string {
    return `outbox:${row.workspaceId}:${row.id}`;
  }

  private async markPublished(rowId: string): Promise<void> {
    await this.prisma.outboxEvent.update({
      where: { id: rowId },
      data: {
        status: OutboxStatus.PUBLISHED,
        publishedAt: new Date(),
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  }

  /**
   * Failure path. Increment `attempts`, record the sanitized error code +
   * message. If the row has reached `maxAttempts`, park it in FAILED.
   * Otherwise, return it to PENDING with an exponential backoff on
   * `availableAt` so the next tick will pick it up.
   */
  private async retryOrFail(row: OutboxEvent, err: unknown): Promise<void> {
    const nextAttempts = row.attempts + 1;
    const code = errorCode(err);
    const message = errorMessage(err);
    if (nextAttempts >= this.maxAttempts) {
      await this.prisma.outboxEvent.update({
        where: { id: row.id },
        data: {
          status: OutboxStatus.FAILED,
          attempts: nextAttempts,
          lastErrorCode: code,
          lastErrorMessage: message,
          lockedBy: null,
          lockedUntil: null,
        },
      });
      this.logger.error(
        `Outbox ${row.id} (workspace=${row.workspaceId}, event=${row.eventName}) reached max attempts and is parked in FAILED`,
      );
      return;
    }
    const backoffMs = backoffFor(nextAttempts);
    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: OutboxStatus.PENDING,
        attempts: nextAttempts,
        lastErrorCode: code,
        lastErrorMessage: message,
        availableAt: new Date(Date.now() + backoffMs),
        lockedBy: null,
        lockedUntil: null,
      },
    });
  }

  /**
   * Variant of `retryOrFail` used when the row is structurally bad (unknown
   * event name). No point retrying — the row is parked in FAILED
   * immediately so the analytics/outbox health counters reflect a real
   * failure.
   */
  private async markFailedUnknownEvent(row: OutboxEvent): Promise<void> {
    const nextAttempts = row.attempts + 1;
    const code = 'UNKNOWN_EVENT_NAME';
    const message = `No queue mapping for eventName=${row.eventName}`;
    await this.prisma.outboxEvent.update({
      where: { id: row.id },
      data: {
        status: OutboxStatus.FAILED,
        attempts: nextAttempts,
        lastErrorCode: code,
        lastErrorMessage: message,
        lockedBy: null,
        lockedUntil: null,
      },
    });
    this.logger.warn(
      `Outbox ${row.id} (workspace=${row.workspaceId}) parked in FAILED: ${message}`,
    );
  }

  private handleTickError(err: unknown): void {
    this.logger.error(
      `OutboxDispatcherService tick failed: ${err instanceof Error ? err.constructor.name : typeof err}`,
    );
  }
}

/**
 * Exponential backoff capped at 5 minutes. Returns milliseconds; the caller
 * adds it to `Date.now()` to set the next `availableAt`. `attempt` is the
 * 1-based attempt count after the most recent failure.
 */
export function backoffFor(attempt: number): number {
  // Cap at 5 minutes so a flapping target does not push a row's next
  // attempt out by an unbounded amount.
  return Math.min(5 * 60_000, 1_000 * 2 ** attempt);
}

function errorCode(err: unknown): string {
  if (err instanceof AppException) return err.code;
  if (err instanceof Prisma.PrismaClientKnownRequestError) return err.code;
  return 'PUBLISH_EXCEPTION';
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    // Cap the persisted message at 256 chars; the structured log keeps the
    // full text. A sanitized tail avoids dumping huge provider stacks into
    // a hot column.
    return err.message.slice(0, 256);
  }
  return typeof err === 'string' ? err.slice(0, 256) : 'unknown';
}
