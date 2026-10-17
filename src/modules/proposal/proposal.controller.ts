import { Body, Controller, Get, Inject, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { uuidPipe } from '../../common/dto/input.js';
import { IdempotencyKey } from '../../common/decorators/idempotency-key.decorator.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { ProposalService } from './proposal.service.js';
import { ProposalRepository } from './proposal.repository.js';
import {
  ApproveProposalRequestDto,
  EditProposalRequestDto,
  ReasonedProposalDecisionDto,
} from './dto/proposal-request.dto.js';
import { ProposalResponseDto } from './dto/proposal-response.dto.js';
import { LeadEndpoint } from '../ai/contracts/lead-endpoints.js';
@ApiTags('Proposals')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller()
export class ProposalController {
  constructor(
    @Inject(ProposalService) private readonly service: ProposalService,
    @Inject(ProposalRepository) private readonly proposals: ProposalRepository,
  ) {}
  @Get('workspaces/:workspaceId/proposals/:proposalId')
  @ApiSuccessResponse(ProposalResponseDto)
  detail(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
  ) {
    return this.proposals.read(actor, id);
  }
  @LeadEndpoint('approveProposal')
  approve(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
    @IdempotencyKey() key: string,
    @Body() b: ApproveProposalRequestDto,
  ) {
    return this.service.approve(actor, id, key, b);
  }
  @LeadEndpoint('editProposal')
  edit(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
    @Body() b: EditProposalRequestDto,
  ) {
    return this.service.edit(actor, id, b);
  }
  @LeadEndpoint('rejectProposal')
  reject(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
    @Body() b: ReasonedProposalDecisionDto,
  ) {
    return this.service.decide(actor, id, 'REJECTED', b);
  }
  @LeadEndpoint('escalateProposal')
  escalate(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
    @Body() b: ReasonedProposalDecisionDto,
  ) {
    return this.service.decide(actor, id, 'ESCALATED', b);
  }
}
