import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  ActionExecutionStatus,
  AuditSubjectType,
  OutboxStatus,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import {
  ActionOutcomesResponseDto,
  AnalyticsSummaryResponseDto,
  AnalyticsWindowQueryDto,
  AuditThroughputResponseDto,
  OutboxHealthResponseDto,
} from './analytics.dto.js';

const MAX_LIMIT = 1000;

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async actionOutcomes(
    workspaceId: string,
    query: AnalyticsWindowQueryDto,
  ): Promise<ActionOutcomesResponseDto> {
    const since = windowStart(query.windowDays);
    const grouped = await this.prisma.actionExecution.groupBy({
      by: ['actionType', 'status'],
      where: { workspaceId, queuedAt: { gte: since } },
      _count: { _all: true },
      _avg: { attempt: true },
    });
    const buckets = new Map<
      string,
      {
        total: number;
        succeeded: number;
        failed: number;
        outcomeUnknown: number;
        attempts: number;
        attemptCount: number;
      }
    >();
    for (const row of grouped) {
      const entry = buckets.get(row.actionType) ?? {
        total: 0,
        succeeded: 0,
        failed: 0,
        outcomeUnknown: 0,
        attempts: 0,
        attemptCount: 0,
      };
      const count = row._count._all;
      entry.total += count;
      entry.attempts += (row._avg.attempt ?? 0) * count;
      entry.attemptCount += count;
      switch (row.status) {
        case ActionExecutionStatus.SUCCEEDED:
          entry.succeeded += count;
          break;
        case ActionExecutionStatus.FAILED:
          entry.failed += count;
          break;
        case ActionExecutionStatus.OUTCOME_UNKNOWN:
          entry.outcomeUnknown += count;
          break;
        default:
          break;
      }
      buckets.set(row.actionType, entry);
    }

    const completedLatency = await this.prisma.actionExecution.findMany({
      where: {
        workspaceId,
        queuedAt: { gte: since },
        finishedAt: { not: null },
        startedAt: { not: null },
      },
      select: {
        actionType: true,
        startedAt: true,
        finishedAt: true,
      },
      take: MAX_LIMIT,
    });
    const latencyByType = new Map<string, { total: number; sumMs: number }>();
    for (const row of completedLatency) {
      if (!row.startedAt || !row.finishedAt) continue;
      const sum = latencyByType.get(row.actionType) ?? { total: 0, sumMs: 0 };
      sum.total += 1;
      sum.sumMs += row.finishedAt.getTime() - row.startedAt.getTime();
      latencyByType.set(row.actionType, sum);
    }

    const response: ActionOutcomesResponseDto = {
      windowDays: query.windowDays,
      totalExecutions: 0,
      buckets: Array.from(buckets.entries())
        .map(([actionType, agg]) => {
          const latency = latencyByType.get(actionType);
          return {
            actionType,
            total: agg.total,
            succeeded: agg.succeeded,
            failed: agg.failed,
            outcomeUnknown: agg.outcomeUnknown,
            avgLatencyMs:
              latency && latency.total > 0
                ? Math.round(latency.sumMs / latency.total)
                : null,
          };
        })
        .sort((a, b) => a.actionType.localeCompare(b.actionType)),
    };
    response.totalExecutions = response.buckets.reduce(
      (sum, b) => sum + b.total,
      0,
    );
    return response;
  }

  async auditThroughput(
    workspaceId: string,
    query: AnalyticsWindowQueryDto,
  ): Promise<AuditThroughputResponseDto> {
    const since = windowStart(query.windowDays);
    const grouped = await this.prisma.auditEvent.groupBy({
      by: ['subjectType'],
      where: { workspaceId, createdAt: { gte: since } },
      _count: { _all: true },
    });
    const bySubject: Record<string, number> = {};
    let total = 0;
    for (const row of grouped) {
      bySubject[row.subjectType] = row._count._all;
      total += row._count._all;
    }
    return {
      windowDays: query.windowDays,
      bySubject,
      totalEvents: total,
    };
  }

  async outboxHealth(workspaceId: string): Promise<OutboxHealthResponseDto> {
    const grouped = await this.prisma.outboxEvent.groupBy({
      by: ['status'],
      where: { workspaceId },
      _count: { _all: true },
    });
    const counts: Record<OutboxStatus, number> = {
      PENDING: 0,
      CLAIMED: 0,
      SENT: 0,
      FAILED: 0,
      PROCESSING: 0,
      PUBLISHED: 0,
    };
    for (const row of grouped) {
      counts[row.status] = row._count._all;
    }
    const now = Date.now();
    const oldestPending = await this.prisma.outboxEvent.findFirst({
      where: { workspaceId, status: OutboxStatus.PENDING },
      orderBy: { nextAttemptAt: 'asc' },
      select: { nextAttemptAt: true },
    });
    const ageSeconds = oldestPending
      ? Math.round((now - oldestPending.nextAttemptAt.getTime()) / 1000)
      : null;
    return {
      pending: counts.PENDING,
      claimed: counts.CLAIMED,
      sent: counts.SENT,
      failed: counts.FAILED,
      avgPendingAgeSeconds: ageSeconds,
    };
  }

  async summary(
    workspaceId: string,
    query: AnalyticsWindowQueryDto,
  ): Promise<AnalyticsSummaryResponseDto> {
    const [actions, audit, outbox] = await Promise.all([
      this.actionOutcomes(workspaceId, query),
      this.auditThroughput(workspaceId, query),
      this.outboxHealth(workspaceId),
    ]);
    return { actions, audit, outbox };
  }
}

function windowStart(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// Re-export the enum so the test file can stub groupBy results without
// importing internal Prisma enums separately.
export { ActionExecutionStatus, AuditSubjectType, OutboxStatus };
export type AnalyticsWhereInput = Prisma.ActionExecutionWhereInput;
