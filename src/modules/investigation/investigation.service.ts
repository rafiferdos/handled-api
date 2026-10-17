import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import {
  InvestigationRepository,
  requireRun,
} from './investigation.repository.js';
import { ProposalRepository } from '../proposal/proposal.repository.js';
import { AiProvider } from '../ai/ai-provider.js';
import { requireTicket } from '../ticket/ticket.service.js';
import { enqueueJob } from '../queue/job-contracts.js';
import { requireCustomer } from '../customer/customer.service.js';
import { writeAudit } from '../audit/audit-writer.js';
@Injectable()
export class InvestigationService {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(InvestigationRepository)
    private readonly runs: InvestigationRepository,
    @Inject(ProposalRepository) private readonly proposals: ProposalRepository,
    @Inject(AiProvider) private readonly provider: AiProvider,
  ) {}
  start(actor: WorkspaceActor, ticketId: string, parentRunId?: string) {
    const metadata = this.provider.metadata();
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, WRITERS);
      const ticket = await requireTicket(tx, actor.workspaceId, ticketId);
      const active = await tx.investigationRun.findFirst({
        where: {
          workspaceId: actor.workspaceId,
          ticketId,
          status: { in: ['QUEUED', 'RUNNING'] },
        },
      });
      if (active) return { investigationId: active.id, status: active.status };
      if (!ticket.customerId || !ticket.customerVerifiedAt)
        throw new AppException('BUSINESS_RULE_FAILED');
      await requireCustomer(tx, actor.workspaceId, ticket.customerId, true);
      if (parentRunId) {
        const parent = await requireRun(tx, actor.workspaceId, parentRunId);
        if (
          parent.ticketId !== ticketId ||
          !['FAILED', 'NEEDS_REVIEW'].includes(parent.status)
        )
          throw new AppException('INVALID_STATE_TRANSITION');
      }
      const run = await this.runs.createInTransaction(tx, actor, ticketId, {
        provider: metadata.provider,
        model: metadata.model,
        promptVersion: metadata.promptVersion,
        ...(parentRunId ? { parentRunId } : {}),
      });
      await tx.ticket.update({
        where: { id: ticketId },
        data: { status: 'QUEUED', version: { increment: 1 } },
      });
      await tx.investigationRun.update({
        where: { id: run.id },
        data: { ticketVersion: ticket.version + 1 },
      });
      await enqueueJob(
        tx,
        actor.workspaceId,
        'investigation',
        run.id,
        actor.requestId,
      );
      await writeAudit(tx, actor, {
        entityType: 'ticket',
        entityId: ticketId,
        eventType: 'investigation.queued',
        metadata: { investigationId: run.id },
      });
      return { investigationId: run.id, status: 'QUEUED' };
    });
  }
  async retry(actor: WorkspaceActor, id: string) {
    const run = await this.runs.read(actor, id);
    if (!['FAILED', 'NEEDS_REVIEW'].includes(run.status))
      throw new AppException('INVALID_STATE_TRANSITION');
    return this.start(actor, run.ticketId, id);
  }
  async detail(actor: WorkspaceActor, id: string) {
    const run = await this.runs.read(actor, id);
    return { ...run, proposal: await this.latestProposal(actor, id) };
  }
  async latestProposal(actor: WorkspaceActor, id: string) {
    const proposal = await this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      await requireRun(tx, actor.workspaceId, id);
      return tx.proposal.findFirst({
        where: { workspaceId: actor.workspaceId, investigationId: id },
        orderBy: { version: 'desc' },
        select: { id: true },
      });
    });
    return proposal ? this.proposals.read(actor, proposal.id) : null;
  }
}
