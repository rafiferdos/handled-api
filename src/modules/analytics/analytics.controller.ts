import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CurrentWorkspace,
  Roles,
  WorkspaceScoped,
} from '../../common/decorators/access.decorator.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import type { WorkspaceMembership } from '../../common/contracts/access-context.js';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AnalyticsService } from './analytics.service.js';
import {
  ActionOutcomesResponseDto,
  AnalyticsSummaryResponseDto,
  AnalyticsWindowQueryDto,
  AuditThroughputResponseDto,
  OutboxHealthResponseDto,
} from './analytics.dto.js';

@ApiTags('Analytics')
@ApiBearerAuth()
@UseGuards(ThrottlerGuard)
@WorkspaceScoped()
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly analytics: AnalyticsService,
  ) {}

  @Get('actions')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.AGENT)
  @ApiOperation({
    summary: 'Action execution outcomes over a window',
    description:
      'Aggregates ActionExecution rows for the workspace into per-actionType buckets (count, succeeded, failed, average latency).',
  })
  @ApiSuccessResponse(ActionOutcomesResponseDto)
  @ApiErrorResponses(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RESOURCE_NOT_FOUND,
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.RATE_LIMITED,
  )
  actions(
    @CurrentWorkspace() membership: WorkspaceMembership,
    @Query() query: AnalyticsWindowQueryDto,
  ) {
    return this.analytics.actionOutcomes(membership.workspaceId, query);
  }

  @Get('audit')
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.AGENT)
  @ApiOperation({
    summary: 'Audit event throughput by subject type',
    description:
      'Counts AuditEvent rows over a window, grouped by subjectType.',
  })
  @ApiSuccessResponse(AuditThroughputResponseDto)
  @ApiErrorResponses(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RESOURCE_NOT_FOUND,
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.RATE_LIMITED,
  )
  audit(
    @CurrentWorkspace() membership: WorkspaceMembership,
    @Query() query: AnalyticsWindowQueryDto,
  ) {
    return this.analytics.auditThroughput(membership.workspaceId, query);
  }

  @Get('outbox')
  @Roles(WorkspaceRole.ADMIN)
  @ApiOperation({
    summary: 'Outbox dispatcher health snapshot',
    description:
      'Returns pending/claimed/sent/failed counts and the age of the oldest PENDING row, all scoped to the workspace.',
  })
  @ApiSuccessResponse(OutboxHealthResponseDto)
  @ApiErrorResponses(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RESOURCE_NOT_FOUND,
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.RATE_LIMITED,
  )
  outbox(@CurrentWorkspace() membership: WorkspaceMembership) {
    return this.analytics.outboxHealth(membership.workspaceId);
  }

  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.AGENT)
  @ApiOperation({
    summary: 'Combined analytics summary',
    description:
      'Returns the action outcomes, audit throughput and outbox health in one payload.',
  })
  @ApiSuccessResponse(AnalyticsSummaryResponseDto)
  @ApiErrorResponses(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RESOURCE_NOT_FOUND,
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.RATE_LIMITED,
  )
  summary(
    @CurrentWorkspace() membership: WorkspaceMembership,
    @Query() query: AnalyticsWindowQueryDto,
  ) {
    return this.analytics.summary(membership.workspaceId, query);
  }
}
