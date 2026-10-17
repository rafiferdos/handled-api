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
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { uuidPipe, VersionDto } from '../../common/dto/input.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ActionService } from './action.service.js';
import { ActionResponseDto } from './action.dto.js';
import { ActionAdmissionResponseDto } from '../proposal/dto/proposal-response.dto.js';
@ApiTags('Simulated actions')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId')
export class ActionController {
  constructor(@Inject(ActionService) private readonly service: ActionService) {}
  @Get('tickets/:ticketId/actions')
  @ApiSuccessResponse(ActionResponseDto, { paginated: true })
  list(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.service.list(actor, id, q);
  }
  @Get('actions/:actionId') @ApiSuccessResponse(ActionResponseDto) detail(
    @CurrentActor() actor: WorkspaceActor,
    @Param('actionId', uuidPipe) id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @Post('actions/:actionId/retry')
  @HttpCode(202)
  @ApiSuccessResponse(ActionAdmissionResponseDto, { status: 202 })
  retry(
    @CurrentActor() actor: WorkspaceActor,
    @Param('actionId', uuidPipe) id: string,
    @Body() body: VersionDto,
  ) {
    return this.service.retry(actor, id, body);
  }
  @Post('actions/:actionId/reconcile')
  @HttpCode(200)
  @ApiSuccessResponse(ActionResponseDto)
  reconcile(
    @CurrentActor() actor: WorkspaceActor,
    @Param('actionId', uuidPipe) id: string,
    @Body() body: VersionDto,
  ) {
    return this.service.reconcile(actor, id, body);
  }
}
