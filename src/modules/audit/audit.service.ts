import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import { requireTicket } from '../ticket/ticket.service.js';
@Injectable()
export class AuditService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  ticket(actor: WorkspaceActor, ticketId: string, query: PaginationQueryDto) {
    return this.read(actor, query, ticketId);
  }
  workspace(actor: WorkspaceActor, query: PaginationQueryDto) {
    return this.read(actor, query);
  }
  private read(
    actor: WorkspaceActor,
    query: PaginationQueryDto,
    ticketId?: string,
  ) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(
        tx,
        actor,
        ticketId ? undefined : [WorkspaceRole.ADMIN],
      );
      if (ticketId) await requireTicket(tx, actor.workspaceId, ticketId);
      const where = {
        workspaceId: actor.workspaceId,
        ...(ticketId ? { entityType: 'ticket', entityId: ticketId } : {}),
      };
      return paginated(
        await tx.auditEvent.findMany({
          where,
          select: {
            id: true,
            entityType: true,
            entityId: true,
            eventType: true,
            actorType: true,
            actorId: true,
            metadata: true,
            requestId: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          ...paginationBounds(query),
        }),
        await tx.auditEvent.count({ where }),
        query,
      );
    });
  }
}
