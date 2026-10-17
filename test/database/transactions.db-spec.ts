import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { createTestDatabase, createActorFixture } from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { IdempotencyService } from '../../src/common/database/idempotency.service.js';
import { assertWorkspaceActor } from '../../src/common/database/workspace-actor.js';
import {
  writeAudit,
  writeOutbox,
} from '../../src/modules/audit/audit-writer.js';

const db = createTestDatabase();
const uow = new UnitOfWork(db.prisma);
const replay = new IdempotencyService(uow);
const resultSchema = z.strictObject({ id: z.uuid() });
afterAll(() => db.close());

describe('transactional foundation', () => {
  it('coalesces concurrent logical creates and hashes property order canonically', async () => {
    const actor = await createActorFixture(db.prisma);
    const scope = {
      workspaceId: actor.workspaceId,
      actorScope: actor.userId,
      operation: 'test.create',
      target: 'customer',
      key: 'request-1',
    };
    const work = async (
      tx: Parameters<Parameters<UnitOfWork['run']>[0]>[0],
    ) => {
      const customer = await tx.customer.create({
        data: {
          workspaceId: actor.workspaceId,
          externalRef: randomUUID(),
          name: 'Customer',
          email: 'test@example.invalid',
        },
      });
      await writeAudit(tx, actor, {
        entityType: 'customer',
        entityId: customer.id,
        eventType: 'customer.created',
      });
      await writeOutbox(tx, actor.workspaceId, {
        type: 'customer.created',
        aggregateId: customer.id,
        payload: { id: customer.id },
      });
      return { id: customer.id };
    };
    const authorize = (tx: Parameters<typeof work>[0]) =>
      assertWorkspaceActor(tx, actor).then(() => undefined);
    const results = await Promise.all(
      Array.from({ length: 4 }, (_, i) =>
        replay.run(
          scope,
          i % 2 ? { a: 1, b: 2 } : { b: 2, a: 1 },
          resultSchema,
          authorize,
          work,
        ),
      ),
    );
    expect(new Set(results.map((r) => r.id)).size).toBe(1);
    expect(
      await db.prisma.customer.count({
        where: { workspaceId: actor.workspaceId },
      }),
    ).toBe(1);
    await expect(
      replay.run(scope, { a: 2 }, resultSchema, authorize, work),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    await db.prisma.membership
      .update({
        where: {
          workspaceId_userId: {
            workspaceId: actor.workspaceId,
            userId: actor.userId,
          },
        },
        data: { status: 'DISABLED' },
      })
      .catch(() => undefined);
    // Revocation is checked before returning any stored receipt.
    await db.prisma
      .$executeRaw`DELETE FROM auth.sessions WHERE id = ${actor.sessionId}::uuid`;
    await expect(
      replay.run(scope, { a: 1, b: 2 }, resultSchema, authorize, work),
    ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('rolls back domain, audit, outbox and idempotency together', async () => {
    const actor = await createActorFixture(db.prisma);
    await expect(
      replay.run(
        {
          workspaceId: actor.workspaceId,
          actorScope: actor.userId,
          operation: 'test.rollback',
          target: 'customer',
          key: 'rollback-1',
        },
        {},
        resultSchema,
        (tx) => assertWorkspaceActor(tx, actor).then(() => undefined),
        async (tx) => {
          const customer = await tx.customer.create({
            data: {
              workspaceId: actor.workspaceId,
              externalRef: 'rollback',
              name: 'Test',
              email: 'test@example.invalid',
            },
          });
          await writeAudit(tx, actor, {
            entityType: 'customer',
            entityId: customer.id,
            eventType: 'customer.created',
          });
          await writeOutbox(tx, actor.workspaceId, {
            type: 'customer.created',
            aggregateId: customer.id,
            payload: {},
          });
          throw new Error('intentional rollback');
        },
      ),
    ).rejects.toThrow('intentional rollback');
    for (const count of await Promise.all([
      db.prisma.customer.count({ where: { workspaceId: actor.workspaceId } }),
      db.prisma.auditEvent.count({ where: { workspaceId: actor.workspaceId } }),
      db.prisma.outboxEvent.count({
        where: { workspaceId: actor.workspaceId },
      }),
      db.prisma.idempotencyRecord.count({
        where: { workspaceId: actor.workspaceId },
      }),
    ]))
      expect(count).toBe(0);
  });

  it('does not retry arbitrary callback failures', async () => {
    let attempts = 0;
    await expect(
      uow.run(async () => {
        attempts++;
        throw new Error('not a serialization failure');
      }),
    ).rejects.toThrow('not a serialization failure');
    expect(attempts).toBe(1);
  });
});
