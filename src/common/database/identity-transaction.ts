import type { Prisma } from '../../generated/prisma/client.js';
import type { VerifiedIdentity } from './workspace-actor.js';
import { AppException } from '../errors/app.exception.js';

declare const identityBoundary: unique symbol;
/** Produced by UnitOfWork.runAs, which revalidates identity before commit. */
export type IdentityTransaction = Prisma.TransactionClient & {
  readonly [identityBoundary]: true;
};
const identities = new WeakMap<
  Prisma.TransactionClient,
  Readonly<VerifiedIdentity>
>();
export function bindTransactionIdentity(
  tx: Prisma.TransactionClient,
  identity: Readonly<VerifiedIdentity>,
) {
  identities.set(tx, identity);
}
export function releaseTransactionIdentity(tx: Prisma.TransactionClient) {
  identities.delete(tx);
}
export function assertTransactionIdentity(
  tx: IdentityTransaction,
  identity: VerifiedIdentity,
): void {
  const bound = identities.get(tx);
  if (
    !bound ||
    bound.userId.toLowerCase() !== identity.userId.toLowerCase() ||
    bound.sessionId.toLowerCase() !== identity.sessionId.toLowerCase() ||
    bound.expiresAt !== identity.expiresAt
  )
    throw new AppException('INTERNAL_ERROR');
}
