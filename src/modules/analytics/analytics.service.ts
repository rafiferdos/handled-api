import { Inject, Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { AppException } from '../../common/errors/app.exception.js';
import { z } from 'zod';
const rangeSchema = z.strictObject({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
function range(input: z.input<typeof rangeSchema>) {
  const parsed = rangeSchema.safeParse(input);
  if (!parsed.success) throw new AppException('VALIDATION_ERROR');
  const to = parsed.data.to ? new Date(parsed.data.to) : new Date(),
    from = parsed.data.from
      ? new Date(parsed.data.from)
      : new Date(to.getTime() - 30 * 86400000);
  if (from > to || to.getTime() - from.getTime() > 366 * 86400000)
    throw new AppException('VALIDATION_ERROR');
  return { from, to };
}
@Injectable()
export class AnalyticsService {
  constructor(@Inject(UnitOfWork) private readonly uow: UnitOfWork) {}
  overview(actor: WorkspaceActor, input: z.input<typeof rangeSchema>) {
    const { from, to } = range(input),
      createdAt = { gte: from, lte: to };
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const workspaceId = actor.workspaceId;
      const tickets = await tx.ticket.count({
          where: { workspaceId, createdAt },
        }),
        resolved = await tx.ticket.count({
          where: { workspaceId, createdAt, status: 'RESOLVED' },
        });
      const aiAssisted = await tx.ticket.count({
        where: {
          workspaceId,
          createdAt,
          runs: {
            some: {
              workspaceId,
              status: { in: ['COMPLETED', 'NEEDS_REVIEW'] },
            },
          },
        },
      });
      const approvals = await tx.proposalDecision.count({
          where: { workspaceId, createdAt, kind: 'APPROVED' },
        }),
        rejections = await tx.proposalDecision.count({
          where: { workspaceId, createdAt, kind: 'REJECTED' },
        }),
        escalations = await tx.proposalDecision.count({
          where: { workspaceId, createdAt, kind: 'ESCALATED' },
        });
      const decisions = approvals + rejections + escalations;
      const duration = await tx.$queryRaw<
        Array<{ average: number | null }>
      >`SELECT AVG(EXTRACT(EPOCH FROM ("finishedAt"-"startedAt"))*1000)::float8 AS average FROM handled."InvestigationRun" WHERE "workspaceId"=${workspaceId}::uuid AND "createdAt">=${from} AND "createdAt"<=${to} AND "startedAt" IS NOT NULL AND "finishedAt" IS NOT NULL`;
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        tickets,
        resolved,
        aiAssisted,
        approvals,
        rejections,
        escalations,
        decisions,
        approvalRate: decisions ? approvals / decisions : null,
        escalationRate: decisions ? escalations / decisions : null,
        averageInvestigationMs: duration[0]?.average ?? null,
      };
    });
  }
  issues(actor: WorkspaceActor, input: z.input<typeof rangeSchema>) {
    const { from, to } = range(input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const categories = await tx.ticket.groupBy({
        by: ['category'],
        where: {
          workspaceId: actor.workspaceId,
          createdAt: { gte: from, lte: to },
        },
        _count: { _all: true },
        orderBy: { category: 'asc' },
      });
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        categories: categories.map((c) => ({
          category: c.category,
          count: c._count._all,
        })),
      };
    });
  }
  ai(actor: WorkspaceActor, input: z.input<typeof rangeSchema>) {
    const { from, to } = range(input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const workspaceId = actor.workspaceId,
        createdAt = { gte: from, lte: to };
      const runs = await tx.investigationRun.groupBy({
          by: ['status'],
          where: { workspaceId, createdAt },
          _count: { _all: true },
        }),
        total = runs.reduce((n, r) => n + r._count._all, 0);
      return {
        from: from.toISOString(),
        to: to.toISOString(),
        runs: total,
        statuses: runs.map((r) => ({ status: r.status, count: r._count._all })),
        proposals: await tx.proposal.count({
          where: { workspaceId, createdAt },
        }),
        lowConfidence: await tx.proposal.count({
          where: { workspaceId, createdAt, confidence: 'LOW' },
        }),
        knowledgeSources: await tx.proposalSource.count({
          where: { workspaceId, createdAt, sourceType: 'KNOWLEDGE' },
        }),
        measuredAccuracy: null,
        accuracyNote:
          'Run the versioned provider evaluation separately; operational counts are not model accuracy.',
      };
    });
  }
}
