import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { OutboxEvent, Prisma } from '../../generated/prisma/client.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  deliverySchema,
  intentSchema,
  jobKindSchema,
} from './job-contracts.js';
import type { JobDelivery, JobKind } from './job-contracts.js';

const LEASE_MS = 60000;
const MAX_ATTEMPTS = 5;
class LeaseLost extends Error {}

export class JobExecution {
  readonly workspaceId: string;
  readonly aggregateId: string;
  readonly requestId: string;
  constructor(
    readonly record: OutboxEvent,
    readonly delivery: JobDelivery,
  ) {
    this.workspaceId = record.workspaceId;
    this.aggregateId = record.aggregateId;
    this.requestId = intentSchema.parse(record.payload).requestId;
  }
  async assertCurrent(tx: Prisma.TransactionClient) {
    const current = await tx.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM handled."OutboxEvent" WHERE id=${this.record.id}::uuid AND status='PENDING' AND "lockToken"=${this.delivery.lockToken}::uuid AND "lockedUntil">clock_timestamp() FOR UPDATE`;
    if (!current[0]) throw new LeaseLost();
  }
  async complete(tx: Prisma.TransactionClient) {
    await this.assertCurrent(tx);
    await tx.outboxEvent.update({
      where: { id: this.record.id },
      data: { status: 'PUBLISHED', lockedUntil: null, lockToken: null },
    });
  }
}
type Handler = (job: JobExecution, signal: AbortSignal) => Promise<void>;
@Injectable()
export class JobRegistry {
  private readonly handlers = new Map<JobKind, Handler>();
  register(kind: JobKind, handler: Handler) {
    if (this.handlers.has(kind)) throw new Error('Duplicate job handler');
    this.handlers.set(kind, handler);
  }
  get(kind: JobKind) {
    return this.handlers.get(kind);
  }
}

@Injectable()
export class OutboxDispatcher {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(JobRegistry) private readonly registry: JobRegistry,
  ) {}
  async dispatch(send: (data: JobDelivery) => Promise<void>, limit = 1) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 20)
      throw new AppException('VALIDATION_ERROR');
    const claimed = await this.uow.run(async (tx) => {
      const rows = await tx.$queryRaw<
        OutboxEvent[]
      >`SELECT * FROM handled."OutboxEvent" WHERE type IN ('job.investigation','job.action','job.knowledge-index') AND status='PENDING' AND "availableAt"<=clock_timestamp() AND ("lockedUntil" IS NULL OR "lockedUntil"<=clock_timestamp()) ORDER BY "availableAt",id FOR UPDATE SKIP LOCKED LIMIT ${limit}`;
      const result: JobDelivery[] = [];
      for (const row of rows) {
        if (row.attempts >= MAX_ATTEMPTS) {
          await tx.outboxEvent.update({
            where: { id: row.id },
            data: { status: 'FAILED', lockToken: null, lockedUntil: null },
          });
          continue;
        }
        const lockToken = randomUUID();
        await tx.outboxEvent.update({
          where: { id: row.id },
          data: {
            attempts: { increment: 1 },
            lockToken,
            lockedUntil: new Date(Date.now() + LEASE_MS),
          },
        });
        result.push({
          outboxId: row.id,
          workspaceId: row.workspaceId,
          lockToken,
        });
      }
      return result;
    });
    for (const data of claimed) {
      try {
        await send(data);
      } catch {
        await this.release(data);
      }
    }
    return claimed.length;
  }
  async process(input: unknown) {
    const parsed = deliverySchema.safeParse(input);
    if (!parsed.success) throw new AppException('VALIDATION_ERROR');
    let data = parsed.data;
    const row = await this.uow.run((tx) =>
      tx.outboxEvent.findUnique({ where: { id: data.outboxId } }),
    );
    if (!row || row.workspaceId !== data.workspaceId)
      throw new AppException('VALIDATION_ERROR');
    if (
      row.status !== 'PENDING' ||
      row.lockToken !== data.lockToken ||
      !row.lockedUntil ||
      row.lockedUntil.getTime() <= Date.now()
    )
      return;
    const kind = jobKindSchema.safeParse(row.type.replace(/^job\./, ''));
    const handler = kind.success ? this.registry.get(kind.data) : undefined;
    if (!handler) {
      await this.release(data);
      return;
    }
    // Consume the delivery token once. Redis may redeliver while the previous
    // handler is alive; only the winner owns the database execution lease.
    const executionToken = randomUUID();
    const claimed = await this.uow.run((tx) =>
      tx.outboxEvent.updateMany({
        where: {
          id: row.id,
          workspaceId: data.workspaceId,
          status: 'PENDING',
          lockToken: data.lockToken,
          lockedUntil: { gt: new Date() },
        },
        data: {
          lockToken: executionToken,
          lockedUntil: new Date(Date.now() + LEASE_MS),
        },
      }),
    );
    if (!claimed.count) return;
    data = { ...data, lockToken: executionToken };
    const controller = new AbortController();
    const timer = setInterval(() => {
      void this.renew(data)
        .then((ok) => {
          if (!ok) controller.abort();
        })
        .catch(() => controller.abort());
    }, LEASE_MS / 3);
    timer.unref();
    try {
      const job = new JobExecution(row, data);
      await handler(job, controller.signal);
      // Domain handlers complete in their final transaction. This also supports
      // terminal no-op deliveries without making a second business effect.
      await this.uow.run(async (tx) => {
        const current = await tx.outboxEvent.findUnique({
          where: { id: row.id },
        });
        if (current?.status === 'PENDING') await job.complete(tx);
      });
    } catch (error) {
      if (!(error instanceof LeaseLost)) await this.release(data);
    } finally {
      clearInterval(timer);
      controller.abort();
    }
  }
  private renew(data: JobDelivery) {
    return this.uow.run(
      async (tx) =>
        (
          await tx.outboxEvent.updateMany({
            where: {
              id: data.outboxId,
              workspaceId: data.workspaceId,
              status: 'PENDING',
              lockToken: data.lockToken,
              lockedUntil: { gt: new Date() },
            },
            data: { lockedUntil: new Date(Date.now() + LEASE_MS) },
          })
        ).count > 0,
    );
  }
  private release(data: JobDelivery) {
    return this.uow.run(async (tx) => {
      const row = await tx.outboxEvent.findUnique({
        where: { id: data.outboxId },
      });
      if (!row || row.lockToken !== data.lockToken || row.status !== 'PENDING')
        return;
      await tx.outboxEvent.updateMany({
        where: {
          id: row.id,
          workspaceId: data.workspaceId,
          status: 'PENDING',
          lockToken: data.lockToken,
        },
        data: {
          status: row.attempts >= MAX_ATTEMPTS ? 'FAILED' : 'PENDING',
          lockToken: null,
          lockedUntil: null,
          availableAt: new Date(
            Date.now() + Math.min(60000, 1000 * 2 ** row.attempts),
          ),
        },
      });
    });
  }
}
