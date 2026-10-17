import { Inject, Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { isIdempotencyKey } from '../contracts/idempotency.contracts.js';
import { AppException } from '../errors/app.exception.js';
import { canonicalJson, sha256 } from './json.js';
import { UnitOfWork } from './unit-of-work.js';

export interface IdempotencyScope {
  workspaceId: string;
  actorScope: string;
  operation: string;
  target: string;
  key: string;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}

  run<T extends Prisma.InputJsonObject>(
    scope: IdempotencyScope,
    payload: Prisma.InputJsonValue,
    schema: z.ZodType<T>,
    authorize: (tx: Prisma.TransactionClient) => Promise<void>,
    work: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    if (!isIdempotencyKey(scope.key))
      throw new AppException('VALIDATION_ERROR');
    const requestHash = sha256(canonicalJson(payload));
    return this.uow.run(async (tx) => {
      // A transaction-scoped lock also coalesces across processes. ReadCommitted
      // takes the receipt snapshot after this lock, including a preceding commit.
      const lock = JSON.stringify([
        scope.workspaceId,
        scope.actorScope,
        scope.operation,
        scope.target,
        scope.key,
      ]);
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lock}, 0))::text`;
      await authorize(tx);
      const previous = await tx.idempotencyRecord.findUnique({
        where: { workspaceId_actorScope_operation_target_key: scope },
      });
      if (previous) {
        if (previous.requestHash !== requestHash)
          throw new AppException('IDEMPOTENCY_CONFLICT');
        const result = schema.parse(previous.response);
        await authorize(tx);
        return result;
      }
      const result = schema.parse(await work(tx));
      await tx.idempotencyRecord.create({
        data: { ...scope, requestHash, response: result },
      });
      await authorize(tx);
      return result;
    }, 'ReadCommitted');
  }
}
