import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { uuidPipe } from '../../common/dto/input.js';
import {
  RequireIdempotencyKey,
  IdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { ProposalService } from './proposal.service.js';
import { ProposalRepository } from './proposal.repository.js';
import {
  ApproveProposalRequestDto,
  EditProposalRequestDto,
  ReasonedProposalDecisionDto,
} from './dto/proposal-request.dto.js';
import {
  ActionAdmissionResponseDto,
  ProposalDecisionResponseDto,
  ProposalResponseDto,
} from './dto/proposal-response.dto.js';
@ApiTags('Proposals')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId/proposals')
export class ProposalController {
  constructor(
    @Inject(ProposalService) private readonly service: ProposalService,
    @Inject(ProposalRepository) private readonly proposals: ProposalRepository,
  ) {}
  @Get(':proposalId') @ApiSuccessResponse(ProposalResponseDto) detail(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
  ) {
    return this.proposals.read(actor, id);
  }
  @Post(':proposalId/approve')
  @RequireIdempotencyKey()
  @HttpCode(202)
  @ApiSuccessResponse(ActionAdmissionResponseDto, { status: 202 })
  approve(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
    @IdempotencyKey() key: string,
    @Body() b: ApproveProposalRequestDto,
  ) {
    return this.service.approve(actor, id, key, b);
  }
  @Post(':proposalId/edit')
  @HttpCode(200)
  @ApiSuccessResponse(ProposalResponseDto)
  edit(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
    @Body() b: EditProposalRequestDto,
  ) {
    return this.service.edit(actor, id, b);
  }
  @Post(':proposalId/reject')
  @HttpCode(200)
  @ApiSuccessResponse(ProposalDecisionResponseDto)
  reject(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
    @Body() b: ReasonedProposalDecisionDto,
  ) {
    return this.service.decide(actor, id, 'REJECTED', b);
  }
  @Post(':proposalId/escalate')
  @HttpCode(200)
  @ApiSuccessResponse(ProposalDecisionResponseDto)
  escalate(
    @CurrentActor() actor: WorkspaceActor,
    @Param('proposalId', uuidPipe) id: string,
    @Body() b: ReasonedProposalDecisionDto,
  ) {
    return this.service.decide(actor, id, 'ESCALATED', b);
  }
}
