import { z } from 'zod';
import type { Prisma } from '../../generated/prisma/client.js';
import { TicketStatus } from '../../generated/prisma/enums.js';
import type { CreateTicketDto } from './ticket.dto.js';
export const ticketReceiptSchema = z.strictObject({
  id: z.uuid(),
  reference: z.string().max(32),
  status: z.enum(TicketStatus),
});

/** Caller owns authorization and transaction. Never accepts a verified customer hint. */
export async function insertTicketWithMessage(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  input: CreateTicketDto,
  context:
    | { source: 'AGENT'; userId: string; membershipId: string }
    | {
        source: 'PUBLIC_FORM';
        requesterEmail: string;
        requesterCustomerRef?: string;
      },
) {
  const workspace = await tx.workspace.update({
    where: { id: workspaceId },
    data: { ticketSequence: { increment: 1 } },
    select: { ticketSequence: true },
  });
  const ticket = await tx.ticket.create({
    data: {
      workspaceId,
      reference: `TKT-${workspace.ticketSequence}`,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      source: context.source,
      ...(context.source === 'PUBLIC_FORM'
        ? {
            requesterEmail: context.requesterEmail,
            requesterCustomerRef: context.requesterCustomerRef,
          }
        : {}),
    },
    select: { id: true, reference: true, status: true },
  });
  await tx.ticketMessage.create({
    data: {
      workspaceId,
      ticketId: ticket.id,
      body: input.body,
      authorType: context.source === 'AGENT' ? 'AGENT' : 'CUSTOMER',
      ...(context.source === 'AGENT'
        ? {
            authorUserId: context.userId,
            authorMembershipId: context.membershipId,
          }
        : {}),
    },
  });
  return ticket;
}
