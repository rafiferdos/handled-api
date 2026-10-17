import { Inject, Injectable } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { assertIdentity } from './workspace-actor.js';
import type { VerifiedIdentity } from './workspace-actor.js';
import {
  bindTransactionIdentity,
  releaseTransactionIdentity,
} from './identity-transaction.js';
import type { IdentityTransaction } from './identity-transaction.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class UnitOfWork {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /** Identity is checked again after callback lock waits; failure rolls back all writes. */
  runAs<T>(
    identity: VerifiedIdentity,
    work: (tx: IdentityTransaction) => Promise<T>,
  ): Promise<T> {
    const captured = Object.freeze({
      userId: identity.userId,
      sessionId: identity.sessionId,
      expiresAt: identity.expiresAt,
    });
    return this.run(async (tx) => {
      await assertIdentity(tx, captured);
      bindTransactionIdentity(tx, captured);
      try {
        const result = await work(tx as IdentityTransaction);
        await assertIdentity(tx, captured);
        return result;
      } finally {
        releaseTransactionIdentity(tx);
      }
    });
  }

  /** Only database effects belong in this callback: serialization may retry it. */
  async run<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    isolationLevel: Prisma.TransactionIsolationLevel = 'ReadCommitted',
  ): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            await tx.$executeRaw`SET LOCAL statement_timeout = '5s'`;
            return work(tx);
          },
          { isolationLevel, maxWait: 5000, timeout: 8000 },
        );
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt >= 2
        )
          throw error;
        await setTimeout(10 * (attempt + 1));
      }
    }
  }
}
