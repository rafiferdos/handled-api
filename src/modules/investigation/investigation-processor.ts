import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import {
  assertWorkspaceActor,
  WRITERS,
} from '../../common/database/workspace-actor.js';
import { jobActor } from '../../common/database/job-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import { Confidence } from '../../common/contracts/domain.enums.js';
import { AiProvider } from '../ai/ai-provider.js';
import type { AiResult } from '../ai/ai-provider.js';
import {
  classificationSchema,
  proposalOutputSchema,
} from '../ai/contracts/proposal-output.schema.js';
import type { Classification } from '../ai/contracts/proposal-output.schema.js';
import { ReadTools } from '../ai/read-tools.js';
import { validateProposalEvidence } from '../ai/evidence-policy.js';
import type { EvidenceSource } from '../proposal/contracts/evidence.schema.js';
import { verifySources } from '../proposal/source-verifier.js';
import { InvestigationRepository } from './investigation.repository.js';
import { ProposalRepository } from '../proposal/proposal.repository.js';
import { JobRegistry } from '../queue/outbox-dispatcher.js';
import type { JobExecution } from '../queue/outbox-dispatcher.js';
import { writeAudit } from '../audit/audit-writer.js';

@Injectable()
export class InvestigationProcessor implements OnModuleInit {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(InvestigationRepository)
    private readonly runs: InvestigationRepository,
    @Inject(ProposalRepository) private readonly proposals: ProposalRepository,
    @Inject(AiProvider) private readonly provider: AiProvider,
    @Inject(ReadTools) private readonly tools: ReadTools,
    @Inject(JobRegistry) private readonly registry: JobRegistry,
  ) {}
  onModuleInit() {
    this.registry.register('investigation', (job, signal) =>
      this.process(job, signal),
    );
  }
  private async process(job: JobExecution, jobSignal: AbortSignal) {
    const run = await this.uow.run((tx) =>
      tx.investigationRun.findUnique({
        where: {
          workspaceId_id: { workspaceId: job.workspaceId, id: job.aggregateId },
        },
      }),
    );
    if (!run || !['QUEUED', 'RUNNING'].includes(run.status)) return;
    const actor = jobActor(
      job.workspaceId,
      run.triggeredByUserId,
      run.triggeredBySessionId,
      job.requestId,
    );
    const signal = AbortSignal.any([jobSignal, AbortSignal.timeout(120000)]);
    try {
      const snapshot = await this.uow.runAs(actor, async (tx) => {
        await assertWorkspaceActor(tx, actor, WRITERS);
        await job.assertCurrent(tx);
        const ticket = await tx.ticket.findUniqueOrThrow({
          where: {
            workspaceId_id: { workspaceId: job.workspaceId, id: run.ticketId },
          },
        });
        if (
          !ticket.customerId ||
          !ticket.customerVerifiedAt ||
          !['QUEUED', 'INVESTIGATING'].includes(ticket.status)
        )
          throw new AppException('BUSINESS_RULE_FAILED');
        const customer = await tx.customer.findUnique({
          where: {
            workspaceId_id: {
              workspaceId: job.workspaceId,
              id: ticket.customerId,
            },
          },
        });
        if (customer?.status !== 'ACTIVE')
          throw new AppException('BUSINESS_RULE_FAILED');
        const messages = await tx.ticketMessage.findMany({
          where: { workspaceId: job.workspaceId, ticketId: ticket.id },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 20,
          select: { id: true, body: true, authorType: true, visibility: true },
        });
        const current = await tx.investigationRun.findUniqueOrThrow({
          where: { id: run.id },
        });
        if (!['QUEUED', 'RUNNING'].includes(current.status))
          throw new AppException('INVALID_STATE_TRANSITION');
        const updated = await tx.ticket.update({
          where: { id: ticket.id },
          data: { status: 'INVESTIGATING', version: { increment: 1 } },
        });
        await tx.investigationRun.update({
          where: { id: run.id },
          data: {
            status: 'RUNNING',
            startedAt: current.startedAt ?? new Date(),
            ticketVersion: updated.version,
            version: { increment: 1 },
          },
        });
        return { ticket: updated, messages };
      });
      const usage = {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        durationMs: 0,
      };
      const collect = <T>(result: AiResult<T>) => {
        usage.calls++;
        usage.inputTokens += result.usage.inputTokens;
        usage.outputTokens += result.usage.outputTokens;
        usage.durationMs += result.usage.durationMs;
        return result.value;
      };
      const classified = await this.provider.classify(snapshot, signal);
      const classification = classificationSchema.parse(collect(classified));
      await this.step(
        job,
        'CLASSIFY',
        'Ticket classified',
        [],
        classified.usage.durationMs,
      );
      const context = {
        actor,
        workspaceId: job.workspaceId,
        requestId: job.requestId,
        ticketId: run.ticketId,
        customerId: snapshot.ticket.customerId!,
        signal,
      };
      const observations: Array<{
        name: string;
        data: Prisma.InputJsonValue | null;
        missingFacts: readonly string[];
      }> = [];
      const sources = new Map<string, EvidenceSource>();
      const missing: string[] = [...classification.missingFacts];
      let calls = 0;
      for (let round = 0; round < 3; round++) {
        signal.throwIfAborted();
        await this.tools.authorize(context);
        const planned = collect(
          await this.provider.planTools(
            {
              ticket: snapshot.ticket,
              messages: snapshot.messages,
              classification,
              observations,
            },
            signal,
          ),
        );
        if (!planned.length) break;
        if (planned.length > 4 || calls + planned.length > 10)
          throw new AppException('AI_PROVIDER_ERROR');
        for (const call of planned) {
          const start = Date.now();
          calls++;
          const result = await this.tools.execute(context, call);
          observations.push({
            name: call.name,
            data: result.data,
            missingFacts: result.missingFacts,
          });
          missing.push(...result.missingFacts);
          for (const source of result.sources)
            sources.set(source.sourceRefId, source);
          await this.step(
            job,
            call.name === 'searchKnowledge' ? 'RAG' : 'TOOL',
            call.name,
            result.sources.map((s) => s.sourceRefId),
            Date.now() - start,
            call.name,
          );
        }
      }
      if (!sources.size)
        missing.push('No verified account or policy observations');
      if (classification.confidence === Confidence.LOW)
        missing.push('Classification needs manual review');
      const observed = [...sources.values()].slice(0, 50);
      const generated = proposalOutputSchema.parse(
        collect(
          await this.provider.recommend(
            {
              ticket: snapshot.ticket,
              classification,
              observations,
              sources: observed,
            },
            signal,
          ),
        ),
      );
      let output = validateProposalEvidence(generated, observed, missing);
      await this.step(
        job,
        'PROPOSE',
        'Resolution recommendation generated',
        generated.evidenceRefs,
        0,
      );
      if (output.category !== classification.category)
        throw new AppException('AI_PROVIDER_ERROR');
      output = proposalOutputSchema.parse({
        ...output,
        ...collect(
          await this.provider.reply(
            { proposal: output, sources: observed },
            signal,
          ),
        ),
      });
      await this.step(
        job,
        'PROPOSE',
        'Customer reply draft generated',
        output.evidenceRefs,
        0,
      );
      const used = observed.filter((s) =>
        output.evidenceRefs.includes(s.sourceRefId),
      );
      await this.uow.runAs(actor, async (tx) => {
        await assertWorkspaceActor(tx, actor, WRITERS);
        await job.assertCurrent(tx);
        const ticket = await tx.ticket.findUniqueOrThrow({
          where: {
            workspaceId_id: { workspaceId: job.workspaceId, id: run.ticketId },
          },
        });
        if (
          ticket.version !== snapshot.ticket.version ||
          ticket.status !== 'INVESTIGATING' ||
          ticket.customerId !== context.customerId ||
          !ticket.customerVerifiedAt
        )
          throw new AppException('BUSINESS_RULE_FAILED');
        const customer = await tx.customer.findUnique({
          where: {
            workspaceId_id: {
              workspaceId: job.workspaceId,
              id: context.customerId,
            },
          },
        });
        if (customer?.status !== 'ACTIVE')
          throw new AppException('BUSINESS_RULE_FAILED');
        await verifySources(tx, job.workspaceId, context.customerId, used);
        await this.proposals.createInTransaction(
          tx,
          actor,
          run.ticketId,
          run.id,
          output,
          used,
        );
        await tx.investigationRun.update({
          where: { id: run.id },
          data: {
            status: output.confidence === 'LOW' ? 'NEEDS_REVIEW' : 'COMPLETED',
            classification,
            usage,
            finishedAt: new Date(),
            version: { increment: 1 },
          },
        });
        await tx.ticket.update({
          where: { id: run.ticketId },
          data: {
            status:
              output.confidence === 'LOW'
                ? 'NEEDS_REVIEW'
                : 'AWAITING_APPROVAL',
            category: classification.category,
            priority: classification.priority,
            version: { increment: 1 },
          },
        });
        await writeAudit(tx, actor, {
          entityType: 'ticket',
          entityId: run.ticketId,
          eventType: 'proposal.ready',
          metadata: { investigationId: run.id, confidence: output.confidence },
        });
        await job.complete(tx);
      });
    } catch (error) {
      await this.fail(job, error);
    }
  }
  private step(
    job: JobExecution,
    type: 'CLASSIFY' | 'TOOL' | 'RAG' | 'PROPOSE',
    label: string,
    sourceRefs: string[],
    durationMs: number,
    toolName?: string,
  ) {
    return this.uow.run(async (tx) => {
      await job.assertCurrent(tx);
      const sequence =
        (await tx.investigationStep.count({
          where: {
            workspaceId: job.workspaceId,
            investigationId: job.aggregateId,
          },
        })) + 1;
      if (sequence > 100) throw new AppException('BUSINESS_RULE_FAILED');
      await tx.investigationStep.create({
        data: {
          workspaceId: job.workspaceId,
          investigationId: job.aggregateId,
          sequence,
          type,
          label,
          status: 'COMPLETED',
          sourceRefs: sourceRefs.slice(0, 50),
          durationMs,
          ...(type === 'TOOL' ? { toolName } : {}),
        },
      });
    });
  }
  private fail(job: JobExecution, error: unknown) {
    return this.uow.run(async (tx) => {
      await tx.$queryRaw`SELECT id FROM handled."Workspace" WHERE id=${job.workspaceId}::uuid FOR UPDATE`;
      await job.assertCurrent(tx);
      const run = await tx.investigationRun.findUnique({
        where: {
          workspaceId_id: { workspaceId: job.workspaceId, id: job.aggregateId },
        },
      });
      if (!run || !['QUEUED', 'RUNNING'].includes(run.status)) {
        await job.complete(tx);
        return;
      }
      const code =
        error instanceof AppException ? error.code : 'AI_PROVIDER_ERROR';
      await tx.investigationRun.update({
        where: { id: run.id },
        data: {
          status: 'FAILED',
          failureCode: code,
          finishedAt: new Date(),
          version: { increment: 1 },
        },
      });
      await tx.ticket.updateMany({
        where: {
          workspaceId: job.workspaceId,
          id: run.ticketId,
          status: { in: ['QUEUED', 'INVESTIGATING'] },
        },
        data: { status: 'NEEDS_REVIEW', version: { increment: 1 } },
      });
      await tx.auditEvent.create({
        data: {
          workspaceId: job.workspaceId,
          entityType: 'ticket',
          entityId: run.ticketId,
          eventType: 'investigation.failed',
          actorType: 'SYSTEM',
          requestId: job.requestId,
          metadata: { investigationId: run.id, errorCode: code },
        },
      });
      await job.complete(tx);
    });
  }
}
