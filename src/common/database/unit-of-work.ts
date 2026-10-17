import { Inject, Injectable } from '@nestjs/common';
import { setTimeout } from 'node:timers/promises';
import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class UnitOfWork {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient) {}

  /** Only database effects belong in this callback: serialization may retry it. */
  async run<T>(
    work: (tx: Prisma.TransactionClient) => Promise<T>,
    isolationLevel: Prisma.TransactionIsolationLevel = 'Serializable',
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
