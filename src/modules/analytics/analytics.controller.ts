import { Controller, Get, Inject, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiParam,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
} from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';
import { Optional } from '../../common/dto/input.js';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { AnalyticsService } from './analytics.service.js';
export class AnalyticsRangeDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @Optional()
  @IsISO8601({ strict: true })
  from?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @Optional()
  @IsISO8601({ strict: true })
  to?: string;
}
class OverviewDto {
  @ApiProperty({ format: 'date-time' }) from: string;
  @ApiProperty({ format: 'date-time' }) to: string;
  @ApiProperty() tickets: number;
  @ApiProperty() resolved: number;
  @ApiProperty() aiAssisted: number;
  @ApiProperty() approvals: number;
  @ApiProperty() rejections: number;
  @ApiProperty() escalations: number;
  @ApiProperty() decisions: number;
  @ApiProperty({ type: Number, nullable: true }) approvalRate: number | null;
  @ApiProperty({ type: Number, nullable: true }) escalationRate: number | null;
  @ApiProperty({ type: Number, nullable: true }) averageInvestigationMs:
    number | null;
}
class AggregateDto {
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'Database-derived scoped counts; no measured accuracy claim.',
  })
  metrics: unknown;
}
@ApiTags('Analytics')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId/analytics')
export class AnalyticsController {
  constructor(
    @Inject(AnalyticsService) private readonly service: AnalyticsService,
  ) {}
  @Get('overview') @ApiSuccessResponse(OverviewDto) overview(
    @CurrentActor() actor: WorkspaceActor,
    @Query() q: AnalyticsRangeDto,
  ) {
    return this.service.overview(actor, q);
  }
  @Get('issues') @ApiSuccessResponse(AggregateDto) issues(
    @CurrentActor() actor: WorkspaceActor,
    @Query() q: AnalyticsRangeDto,
  ) {
    return this.service.issues(actor, q).then((metrics) => ({ metrics }));
  }
  @Get('ai') @ApiSuccessResponse(AggregateDto) ai(
    @CurrentActor() actor: WorkspaceActor,
    @Query() q: AnalyticsRangeDto,
  ) {
    return this.service.ai(actor, q).then((metrics) => ({ metrics }));
  }
}
