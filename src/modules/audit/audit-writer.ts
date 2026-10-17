import type { Prisma } from '../../generated/prisma/client.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';

export function writeAudit(
  tx: Prisma.TransactionClient,
  actor: WorkspaceActor,
  event: {
    entityType: string;
    entityId: string;
    eventType: string;
    metadata?: Prisma.InputJsonObject;
  },
) {
  return tx.auditEvent.create({
    data: {
      workspaceId: actor.workspaceId,
      actorType: 'USER',
      actorId: actor.userId,
      requestId: actor.requestId,
      ...event,
    },
  });
}

export function writeOutbox(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  event: { type: string; aggregateId: string; payload: Prisma.InputJsonObject },
) {
  return tx.outboxEvent.create({ data: { workspaceId, ...event } });
}
