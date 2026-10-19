import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { isUUID } from 'class-validator';
import { AccessContextGuard } from '../../common/guards/access-context.guard.js';
import {
  Roles,
  WorkspaceScoped,
} from '../../common/decorators/access.decorator.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { AppException } from '../../common/errors/app.exception.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { AuditService } from './audit.service.js';
import { AuditEventResponseDto } from './dto/audit-event-response.dto.js';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(AccessContextGuard)
@Controller('workspaces/:workspaceId/tickets/:ticketId/audit')
export class AuditController {
  constructor(@Inject(AuditService) private readonly audit: AuditService) {}

  @Get()
  @WorkspaceScoped()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.AGENT, WorkspaceRole.VIEWER)
  @ApiOperation({
    summary: 'List audit events for a ticket',
    description:
      'Returns direct TICKET events plus ACTION_EXECUTION events tied to the ticket, scoped to the workspace.',
  })
  @ApiSuccessResponse(AuditEventResponseDto, { paginated: true })
  @ApiErrorResponses(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RESOURCE_NOT_FOUND,
    ErrorCode.VALIDATION_ERROR,
  )
  async list(
    @Param('workspaceId') workspaceId: string,
    @Param('ticketId') ticketId: string,
    @Query() query: PaginationQueryDto,
  ) {
    if (!isUUID(workspaceId) || !isUUID(ticketId)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR);
    }
    return this.audit.listTicketAudits(workspaceId, ticketId, query);
  }
}
