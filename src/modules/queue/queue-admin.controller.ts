import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsInt, Min, Max } from 'class-validator';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { uuidPipe } from '../../common/dto/input.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { QueueAdminService } from './queue-admin.service.js';
class RetryJobDto {
  @ApiProperty({ minimum: 0, maximum: 2147483647 })
  @IsInt()
  @Min(0)
  @Max(2147483647)
  expectedAttempts: number;
}
class DurableJobDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() type: string;
  @ApiProperty({ format: 'uuid' }) aggregateId: string;
  @ApiProperty({ enum: ['PENDING', 'PUBLISHED', 'FAILED'] }) status: string;
  @ApiProperty() attempts: number;
  @ApiProperty({ format: 'date-time' }) availableAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  lockedUntil: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
@ApiTags('Durable jobs')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId/jobs')
export class QueueAdminController {
  constructor(
    @Inject(QueueAdminService) private readonly service: QueueAdminService,
  ) {}
  @Get() @ApiSuccessResponse(DurableJobDto, { paginated: true }) list(
    @CurrentActor() actor: WorkspaceActor,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.list(actor, q);
  }
  @Post(':jobId/retry')
  @HttpCode(202)
  @ApiSuccessResponse(DurableJobDto, { status: 202 })
  retry(
    @CurrentActor() actor: WorkspaceActor,
    @Param('jobId', uuidPipe) id: string,
    @Body() b: RetryJobDto,
  ) {
    return this.service.retry(actor, id, b);
  }
}
