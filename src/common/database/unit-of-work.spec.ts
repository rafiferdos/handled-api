import { Prisma } from '../../generated/prisma/client.js';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { UnitOfWork } from './unit-of-work.js';

it('bounds recognized serialization retries to three attempts', async () => {
  const conflict = new Prisma.PrismaClientKnownRequestError('Conflict', {
    code: 'P2034',
    clientVersion: 'test',
  });
  const transaction = vi.fn().mockRejectedValue(conflict);
  const uow = new UnitOfWork({
    $transaction: transaction,
  } as unknown as PrismaClient);
  await expect(uow.run(async () => 'never')).rejects.toBe(conflict);
  expect(transaction).toHaveBeenCalledTimes(3);
});
