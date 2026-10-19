import { Controller, Get, Inject, Param, UseGuards } from '@nestjs/common';
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
import { ActionService } from './action.service.js';
import { ActionExecutionResponseDto } from './dto/action-execution-response.dto.js';


@ApiTags('Actions')
@ApiBearerAuth()
@UseGuards(AccessContextGuard)
@Controller()
export class ActionController {
  constructor(@Inject(ActionService) private readonly actions: ActionService) {}


  @Get('workspaces/:workspaceId/tickets/:ticketId/actions')
  @WorkspaceScoped()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.AGENT, WorkspaceRole.VIEWER)
  @ApiOperation({
    summary: 'List action executions for a ticket',
    description:
      'Returns action executions whose ticketId matches the path, ordered by queuedAt desc. Workspace-scoped.',
  })
  @ApiSuccessResponse(ActionExecutionResponseDto)
  @ApiErrorResponses(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RESOURCE_NOT_FOUND,
    ErrorCode.VALIDATION_ERROR,
  )
  async listByTicket(
    @Param('workspaceId') workspaceId: string,
    @Param('ticketId') ticketId: string,
  ): Promise<ActionExecutionResponseDto[]> {
    if (!isUUID(workspaceId) || !isUUID(ticketId)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR);
    }
    return this.actions.getActionsByTicket(workspaceId, ticketId);
  }

 
  @Get('workspaces/:workspaceId/actions/:actionId')
  @WorkspaceScoped()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.AGENT, WorkspaceRole.VIEWER)
  @ApiOperation({
    summary: 'Get an action execution by id',
    description:
      'Returns the action execution scoped to the workspace. Cross-tenant access is reported as 404.',
  })
  @ApiSuccessResponse(ActionExecutionResponseDto)
  @ApiErrorResponses(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RESOURCE_NOT_FOUND,
    ErrorCode.VALIDATION_ERROR,
  )
  async getById(
    @Param('workspaceId') workspaceId: string,
    @Param('actionId') actionId: string,
  ): Promise<ActionExecutionResponseDto> {
    if (!isUUID(workspaceId) || !isUUID(actionId)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR);
    }
    return this.actions.getActionById(workspaceId, actionId);
  }
}
