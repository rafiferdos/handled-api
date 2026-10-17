import { Inject, Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { IdempotencyService } from '../../common/database/idempotency.service.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { AppException } from '../../common/errors/app.exception.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import { requireCustomer } from '../customer/customer.service.js';
import { writeAudit, writeOutbox } from '../audit/audit-writer.js';
import { TicketStateService } from './ticket-state.service.js';
import {
  insertTicketWithMessage,
  ticketReceiptSchema,
} from './ticket-writer.js';
import type {
  CreateTicketDto,
  UpdateTicketDto,
  TicketQueryDto,
  AddMessageDto,
  AssignTicketDto,
  LinkCustomerDto,
  ManualTicketStatusDto,
} from './ticket.dto.js';
export const ticketSelect = {
  id: true,
  reference: true,
  subject: true,
  category: true,
  priority: true,
  status: true,
  source: true,
  customerId: true,
  customerVerifiedAt: true,
  assigneeId: true,
  requesterEmail: true,
  requesterCustomerRef: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;
export async function requireTicket(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
) {
  const ticket = await tx.ticket.findUnique({
    where: { workspaceId_id: { workspaceId, id } },
    select: ticketSelect,
  });
  if (!ticket) throw new AppException('RESOURCE_NOT_FOUND');
  return ticket;
}
@Injectable()
export class TicketService {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(IdempotencyService) private readonly replay: IdempotencyService,
    @Inject(TicketStateService) private readonly states: TicketStateService,
  ) {}
  create(actor: WorkspaceActor, key: string, input: CreateTicketDto) {
    return this.replay.run(
      {
        workspaceId: actor.workspaceId,
        actorScope: actor.userId,
        operation: 'ticket.create',
        target: 'tickets',
        key,
      },
      {
        subject: input.subject,
        body: input.body,
        category: input.category ?? null,
        priority: input.priority ?? 'MEDIUM',
      },
      ticketReceiptSchema,
      (tx) => assertWorkspaceActor(tx, actor, WRITERS).then(() => undefined),
      async (tx) => {
        const member = await assertWorkspaceActor(tx, actor, WRITERS);
        const ticket = await insertTicketWithMessage(
          tx,
          actor.workspaceId,
          input,
          { source: 'AGENT', userId: actor.userId, membershipId: member.id },
        );
        await writeAudit(tx, actor, {
          entityType: 'ticket',
          entityId: ticket.id,
          eventType: 'ticket.created',
        });
        await writeOutbox(tx, actor.workspaceId, {
          type: 'ticket.created',
          aggregateId: ticket.id,
          payload: { ticketId: ticket.id },
        });
        return ticket;
      },
    );
  }
  list(actor: WorkspaceActor, query: TicketQueryDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const where: Prisma.TicketWhereInput = {
        workspaceId: actor.workspaceId,
        status: query.status,
        category: query.category,
        priority: query.priority,
        customerId: query.customerId,
        assigneeId: query.assigneeId,
        ...(query.search
          ? {
              OR: [
                { subject: { contains: query.search, mode: 'insensitive' } },
                { reference: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      return paginated(
        await tx.ticket.findMany({
          where,
          select: ticketSelect,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          ...paginationBounds(query),
        }),
        await tx.ticket.count({ where }),
        query,
      );
    });
  }
  detail(actor: WorkspaceActor, id: string) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      return requireTicket(tx, actor.workspaceId, id);
    });
  }
  update(actor: WorkspaceActor, id: string, input: UpdateTicketDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      await requireTicket(tx, actor.workspaceId, id);
      await this.updateVersion(tx, actor, id, input.expectedVersion, {
        subject: input.subject,
        category: input.category,
        priority: input.priority,
      });
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: id,
        eventType: 'ticket.updated',
      });
      return requireTicket(tx, actor.workspaceId, id);
    });
  }
  messages(actor: WorkspaceActor, id: string, query: PaginationQueryDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor);
      await requireTicket(tx, actor.workspaceId, id);
      const where = { workspaceId: actor.workspaceId, ticketId: id };
      return paginated(
        await tx.ticketMessage.findMany({
          where,
          select: {
            id: true,
            authorType: true,
            visibility: true,
            authorUserId: true,
            body: true,
            createdAt: true,
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          ...paginationBounds(query),
        }),
        await tx.ticketMessage.count({ where }),
        query,
      );
    });
  }
  addMessage(actor: WorkspaceActor, id: string, input: AddMessageDto) {
    return this.uow.run(async (tx) => {
      const member = await assertWorkspaceActor(tx, actor, WRITERS);
      const ticket = await requireTicket(tx, actor.workspaceId, id);
      if (ticket.status === 'CLOSED')
        throw new AppException('INVALID_STATE_TRANSITION');
      const message = await tx.ticketMessage.create({
        data: {
          workspaceId: actor.workspaceId,
          ticketId: id,
          authorType: 'AGENT',
          authorUserId: actor.userId,
          authorMembershipId: member.id,
          visibility: input.visibility ?? 'PUBLIC',
          body: input.body,
        },
        select: {
          id: true,
          authorType: true,
          visibility: true,
          authorUserId: true,
          body: true,
          createdAt: true,
        },
      });
      await this.updateVersion(tx, actor, id, ticket.version, {});
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: id,
        eventType: 'ticket.message_added',
        metadata: { messageId: message.id, visibility: message.visibility },
      });
      return message;
    });
  }
  assign(actor: WorkspaceActor, id: string, input: AssignTicketDto) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      await requireTicket(tx, actor.workspaceId, id);
      if (input.assigneeId) {
        const member = await tx.membership.findUnique({
          where: {
            workspaceId_id: {
              workspaceId: actor.workspaceId,
              id: input.assigneeId,
            },
          },
        });
        if (!member || member.status !== 'ACTIVE' || member.role === 'VIEWER')
          throw new AppException('RESOURCE_NOT_FOUND');
      }
      await this.updateVersion(tx, actor, id, input.expectedVersion, {
        assigneeId: input.assigneeId,
      });
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: id,
        eventType: 'ticket.assigned',
        metadata: { assigneeId: input.assigneeId },
      });
      return requireTicket(tx, actor.workspaceId, id);
    });
  }
  linkCustomer(actor: WorkspaceActor, id: string, input: LinkCustomerDto) {
    return this.uow.run(async (tx) => {
      const member = await assertWorkspaceActor(tx, actor, WRITERS);
      const ticket = await requireTicket(tx, actor.workspaceId, id);
      if (
        !input.verificationReason.trim() ||
        input.verificationReason.length > 2000
      )
        throw new AppException('VALIDATION_ERROR');
      if (
        !['NEW', 'NEEDS_REVIEW', 'REJECTED'].includes(ticket.status) ||
        (await tx.investigationRun.count({
          where: {
            workspaceId: actor.workspaceId,
            ticketId: id,
            status: { in: ['QUEUED', 'RUNNING'] },
          },
        }))
      )
        throw new AppException('INVALID_STATE_TRANSITION');
      await requireCustomer(tx, actor.workspaceId, input.customerId, true);
      await this.updateVersion(tx, actor, id, input.expectedVersion, {
        customerId: input.customerId,
        customerVerifiedAt: new Date(),
        customerVerifiedById: member.id,
      });
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: id,
        eventType: 'ticket.customer_verified',
        metadata: {
          customerId: input.customerId,
          reason: input.verificationReason,
        },
      });
      return requireTicket(tx, actor.workspaceId, id);
    });
  }
  manualStatus(
    actor: WorkspaceActor,
    id: string,
    input: ManualTicketStatusDto,
  ) {
    return this.uow.run(async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      await this.states.transition(
        tx,
        actor.workspaceId,
        id,
        input.expectedVersion,
        input.status,
        true,
      );
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: id,
        eventType: 'ticket.status_changed',
        metadata: { status: input.status },
      });
      return requireTicket(tx, actor.workspaceId, id);
    });
  }
  private async updateVersion(
    tx: Prisma.TransactionClient,
    actor: WorkspaceActor,
    id: string,
    version: number,
    data: Prisma.TicketUncheckedUpdateManyInput,
  ) {
    const result = await tx.ticket.updateMany({
      where: { workspaceId: actor.workspaceId, id, version },
      data: { ...data, version: { increment: 1 } },
    });
    if (!result.count) throw new AppException('INVALID_STATE_TRANSITION');
  }
}
