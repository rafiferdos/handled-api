import { Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { uuidPipe } from '../../common/dto/input.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { AuditService } from './audit.service.js';
class AuditEventDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() entityType: string;
  @ApiProperty({ format: 'uuid' }) entityId: string;
  @ApiProperty() eventType: string;
  @ApiProperty({ enum: ['USER', 'AI', 'SYSTEM'] }) actorType: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) actorId:
    string | null;
  @ApiProperty({ type: 'object', additionalProperties: true })
  metadata: unknown;
  @ApiProperty() requestId: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
@ApiTags('Audit')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId')
export class AuditController {
  constructor(@Inject(AuditService) private readonly service: AuditService) {}
  @Get('tickets/:ticketId/audit')
  @ApiSuccessResponse(AuditEventDto, { paginated: true })
  ticket(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.ticket(actor, id, q);
  }
  @Get('audit')
  @ApiSuccessResponse(AuditEventDto, { paginated: true })
  workspace(
    @CurrentActor() actor: WorkspaceActor,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.workspace(actor, q);
  }
}
