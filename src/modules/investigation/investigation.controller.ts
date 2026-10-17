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
import { uuidPipe } from '../../common/dto/input.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { InvestigationService } from './investigation.service.js';
import { InvestigationRepository } from './investigation.repository.js';
import {
  InvestigationAdmissionResponseDto,
  InvestigationSummaryDto,
  InvestigationDetailDto,
} from './dto/investigation-response.dto.js';
import { EmptyInvestigationBodyPipe } from './dto/empty-investigation-body.pipe.js';
import { ProposalResponseDto } from '../proposal/dto/proposal-response.dto.js';
@ApiTags('Investigations')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId')
export class InvestigationController {
  constructor(
    @Inject(InvestigationService)
    private readonly service: InvestigationService,
    @Inject(InvestigationRepository)
    private readonly runs: InvestigationRepository,
  ) {}
  @Post('tickets/:ticketId/investigations')
  @HttpCode(202)
  @ApiSuccessResponse(InvestigationAdmissionResponseDto, { status: 202 })
  start(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Body(new EmptyInvestigationBodyPipe()) _body: void,
  ) {
    return this.service.start(actor, id);
  }
  @Get('tickets/:ticketId/investigations')
  @ApiSuccessResponse(InvestigationSummaryDto, { paginated: true })
  list(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Query() q: PaginationQueryDto,
  ) {
    return this.runs.list(actor, id, q);
  }
  @Get('investigations/:investigationId')
  @ApiSuccessResponse(InvestigationDetailDto)
  detail(
    @CurrentActor() actor: WorkspaceActor,
    @Param('investigationId', uuidPipe) id: string,
  ) {
    return this.service.detail(actor, id);
  }
  @Post('investigations/:investigationId/retry')
  @HttpCode(202)
  @ApiSuccessResponse(InvestigationAdmissionResponseDto, { status: 202 })
  retry(
    @CurrentActor() actor: WorkspaceActor,
    @Param('investigationId', uuidPipe) id: string,
    @Body(new EmptyInvestigationBodyPipe()) _body: void,
  ) {
    return this.service.retry(actor, id);
  }
  @Get('investigations/:investigationId/proposal')
  @ApiSuccessResponse(ProposalResponseDto)
  proposal(
    @CurrentActor() actor: WorkspaceActor,
    @Param('investigationId', uuidPipe) id: string,
  ) {
    return this.service.latestProposal(actor, id);
  }
}
