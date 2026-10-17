import { Body, Controller, Get, Inject, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { uuidPipe } from '../../common/dto/input.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { InvestigationService } from './investigation.service.js';
import { InvestigationRepository } from './investigation.repository.js';
import { InvestigationSummaryDto } from './dto/investigation-response.dto.js';
import { LeadEndpoint } from '../ai/contracts/lead-endpoints.js';
import { InvestigationListQueryDto } from './dto/investigation-request.dto.js';
import { EmptyInvestigationBodyPipe } from './dto/empty-investigation-body.pipe.js';
@ApiTags('Investigations')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller()
export class InvestigationController {
  constructor(
    @Inject(InvestigationService)
    private readonly service: InvestigationService,
    @Inject(InvestigationRepository)
    private readonly runs: InvestigationRepository,
  ) {}
  @LeadEndpoint('startInvestigation')
  start(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Body(new EmptyInvestigationBodyPipe()) _body: void,
  ) {
    return this.service.start(actor, id);
  }
  @Get('workspaces/:workspaceId/tickets/:ticketId/investigations')
  @ApiSuccessResponse(InvestigationSummaryDto, { paginated: true })
  list(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.runs.list(actor, id, q);
  }
  @LeadEndpoint('listInvestigations')
  all(
    @CurrentActor() actor: WorkspaceActor,
    @Query() q: InvestigationListQueryDto,
  ) {
    return this.runs.listAll(actor, q);
  }
  @LeadEndpoint('getInvestigation')
  detail(
    @CurrentActor() actor: WorkspaceActor,
    @Param('investigationId', uuidPipe) id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @LeadEndpoint('retryInvestigation')
  retry(
    @CurrentActor() actor: WorkspaceActor,
    @Param('investigationId', uuidPipe) id: string,
    @Body(new EmptyInvestigationBodyPipe()) _body: void,
  ) {
    return this.service.retry(actor, id);
  }
  @LeadEndpoint('getInvestigationProposal')
  proposal(
    @CurrentActor() actor: WorkspaceActor,
    @Param('investigationId', uuidPipe) id: string,
  ) {
    return this.service.latestProposal(actor, id);
  }
}
