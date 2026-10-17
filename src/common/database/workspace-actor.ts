import { isUUID } from 'class-validator';
import type { Prisma } from '../../generated/prisma/client.js';
import { WorkspaceRole } from '../contracts/access-context.js';
import { AppException } from '../errors/app.exception.js';

export interface VerifiedIdentity {
  userId: string;
  sessionId: string;
  expiresAt: number;
}

export interface WorkspaceActor extends VerifiedIdentity {
  workspaceId: string;
  requestId: string;
}

/** Reads only Supabase-managed rows. No business migration owns auth.*. */
export async function assertIdentity(
  tx: Prisma.TransactionClient,
  identity: VerifiedIdentity,
): Promise<{ id: string; email: string }> {
  if (
    !isUUID(identity.userId) ||
    !isUUID(identity.sessionId) ||
    !Number.isFinite(identity.expiresAt) ||
    identity.expiresAt <= Date.now() / 1000
  )
    throw new AppException('UNAUTHENTICATED');
  const users = await tx.$queryRaw<Array<{ id: string; email: string }>>`
    SELECT id, email FROM handled.active_identity(${identity.userId}::uuid, ${identity.sessionId}::uuid)`;
  const user = users[0];
  if (!user || identity.expiresAt <= Date.now() / 1000)
    throw new AppException('UNAUTHENTICATED');
  return user;
}

export const WRITERS: readonly WorkspaceRole[] = [
  WorkspaceRole.ADMIN,
  WorkspaceRole.AGENT,
];

export async function assertWorkspaceActor(
  tx: Prisma.TransactionClient,
  actor: WorkspaceActor,
  roles?: readonly WorkspaceRole[],
) {
  await assertIdentity(tx, actor);
  if (!isUUID(actor.workspaceId)) throw new AppException('RESOURCE_NOT_FOUND');
  // All domain writers take this lock first. Membership changes use the same
  // order, so current authority and last-admin checks share a linearization point.
  const workspaces = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM handled."Workspace" WHERE id = ${actor.workspaceId}::uuid AND status = 'ACTIVE' FOR UPDATE`;
  if (!workspaces[0]) throw new AppException('RESOURCE_NOT_FOUND');
  const member = await tx.membership.findUnique({
    where: {
      workspaceId_userId: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
      },
    },
  });
  if (!member || member.status !== 'ACTIVE')
    throw new AppException('RESOURCE_NOT_FOUND');
  if (roles && !roles.some((role) => role === member.role))
    throw new AppException('FORBIDDEN');
  return member;
}
