import { Prisma } from '../../generated/prisma/client.js';
import { AppException } from '../errors/app.exception.js';

/** Translate only known constraints; unexpected failures retain safe global 500s. */
export function rethrowDatabaseError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') throw new AppException('DUPLICATE_RESOURCE');
    if (error.code === 'P2003') throw new AppException('BUSINESS_RULE_FAILED');
    if (error.code === 'P2025') throw new AppException('RESOURCE_NOT_FOUND');
    if (error.code === 'P2034')
      throw new AppException('INVALID_STATE_TRANSITION');
  }
  throw error;
}
