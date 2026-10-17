import {
  Body,
  Controller,
  Get,
  Inject,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  CurrentActor,
  CurrentIdentity,
} from '../../common/decorators/actor.decorator.js';
import { RequestId } from '../../common/decorators/request-id.decorator.js';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import type {
  VerifiedIdentity,
  WorkspaceActor,
} from '../../common/database/workspace-actor.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import {
  CreateWorkspaceDto,
  UpdateWorkspaceDto,
  WorkspaceResponseDto,
} from './workspace.dto.js';
import { WorkspaceService } from './workspace.service.js';

@ApiTags('Workspaces')
@ApiBearerAuth()
@Controller('workspaces')
export class WorkspaceController {
  constructor(
    @Inject(WorkspaceService) private readonly workspaces: WorkspaceService,
  ) {}
  @Post()
  @ApiSuccessResponse(WorkspaceResponseDto, { status: 201 })
  create(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() input: CreateWorkspaceDto,
    @RequestId() requestId: string,
  ) {
    return this.workspaces.create(identity, input, requestId);
  }
  @Get()
  @ApiSuccessResponse(WorkspaceResponseDto, { paginated: true })
  list(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Query() query: PaginationQueryDto,
  ) {
    return this.workspaces.list(identity, query);
  }
  @Get(':workspaceId')
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @WorkspaceScoped()
  @ApiSuccessResponse(WorkspaceResponseDto)
  detail(@CurrentActor() actor: WorkspaceActor) {
    return this.workspaces.detail(actor);
  }
  @Patch(':workspaceId')
  @ApiParam({ name: 'workspaceId', format: 'uuid' })
  @WorkspaceScoped()
  @ApiSuccessResponse(WorkspaceResponseDto)
  update(
    @CurrentActor() actor: WorkspaceActor,
    @Body() input: UpdateWorkspaceDto,
  ) {
    return this.workspaces.update(actor, input);
  }
}
