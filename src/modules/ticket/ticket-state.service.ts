import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { TicketStatus } from '../../generated/prisma/enums.js';
import { AppException } from '../../common/errors/app.exception.js';
const edges: Record<TicketStatus, readonly TicketStatus[]> = {
  NEW: ['QUEUED', 'CLOSED'],
  QUEUED: ['INVESTIGATING', 'NEEDS_REVIEW'],
  INVESTIGATING: ['AWAITING_APPROVAL', 'NEEDS_REVIEW'],
  AWAITING_APPROVAL: ['EXECUTING', 'REJECTED', 'NEEDS_REVIEW'],
  NEEDS_REVIEW: ['QUEUED', 'CLOSED'],
  EXECUTING: ['RESOLVED', 'EXECUTION_FAILED'],
  EXECUTION_FAILED: ['NEEDS_REVIEW', 'CLOSED'],
  RESOLVED: ['CLOSED'],
  REJECTED: ['QUEUED', 'CLOSED'],
  CLOSED: [],
};
@Injectable()
export class TicketStateService {
  async transition(
    tx: Prisma.TransactionClient,
    workspaceId: string,
    id: string,
    expectedVersion: number,
    next: TicketStatus,
    manual = false,
  ) {
    const ticket = await tx.ticket.findUnique({
      where: { workspaceId_id: { workspaceId, id } },
    });
    if (!ticket) throw new AppException('RESOURCE_NOT_FOUND');
    if (
      ticket.version !== expectedVersion ||
      !edges[ticket.status].includes(next) ||
      (manual &&
        next !== 'CLOSED' &&
        !(ticket.status === 'EXECUTION_FAILED' && next === 'NEEDS_REVIEW'))
    )
      throw new AppException('INVALID_STATE_TRANSITION');
    const result = await tx.ticket.updateMany({
      where: {
        workspaceId,
        id,
        version: expectedVersion,
        status: ticket.status,
      },
      data: { status: next, version: { increment: 1 } },
    });
    if (!result.count) throw new AppException('INVALID_STATE_TRANSITION');
  }
}
