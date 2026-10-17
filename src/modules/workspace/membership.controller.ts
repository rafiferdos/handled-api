import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
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
  WorkspaceActor,
  VerifiedIdentity,
} from '../../common/database/workspace-actor.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { uuidPipe } from '../../common/dto/input.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { MembershipService } from './membership.service.js';
import { InvitationService } from './invitation.service.js';
import {
  UpdateMemberDto,
  CreateInviteDto,
  AcceptInviteDto,
  MemberResponseDto,
  InviteResponseDto,
  IssuedInviteResponseDto,
  AcceptedInviteResponseDto,
} from './membership.dto.js';

@ApiTags('Membership')
@ApiBearerAuth()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@WorkspaceScoped()
@Controller('workspaces/:workspaceId')
export class MembershipController {
  constructor(
    @Inject(MembershipService) private readonly members: MembershipService,
    @Inject(InvitationService) private readonly invites: InvitationService,
  ) {}
  @Get('members')
  @ApiSuccessResponse(MemberResponseDto, { paginated: true })
  list(
    @CurrentActor() actor: WorkspaceActor,
    @Query() query: PaginationQueryDto,
  ) {
    return this.members.list(actor, query);
  }
  @Patch('members/:memberId')
  @ApiSuccessResponse(MemberResponseDto)
  update(
    @CurrentActor() actor: WorkspaceActor,
    @Param('memberId', uuidPipe) id: string,
    @Body() input: UpdateMemberDto,
  ) {
    return this.members.update(actor, id, input);
  }
  @Post('invites')
  @ApiSuccessResponse(IssuedInviteResponseDto, { status: 201 })
  create(
    @CurrentActor() actor: WorkspaceActor,
    @Body() input: CreateInviteDto,
  ) {
    return this.invites.create(actor, input);
  }
  @Get('invites')
  @ApiSuccessResponse(InviteResponseDto, { paginated: true })
  invitesList(
    @CurrentActor() actor: WorkspaceActor,
    @Query() query: PaginationQueryDto,
  ) {
    return this.invites.list(actor, query);
  }
  @Post('invites/:inviteId/revoke')
  @HttpCode(200)
  @ApiSuccessResponse(InviteResponseDto)
  revoke(
    @CurrentActor() actor: WorkspaceActor,
    @Param('inviteId', uuidPipe) id: string,
  ) {
    return this.invites.revoke(actor, id);
  }
}
@ApiTags('Membership')
@ApiBearerAuth()
@Controller('invites')
export class InviteAcceptController {
  constructor(
    @Inject(InvitationService) private readonly invites: InvitationService,
  ) {}
  @Post('accept')
  @HttpCode(200)
  @ApiSuccessResponse(AcceptedInviteResponseDto)
  accept(
    @CurrentIdentity() identity: VerifiedIdentity,
    @Body() input: AcceptInviteDto,
    @RequestId() requestId: string,
  ) {
    return this.invites.accept(identity, input.token, requestId);
  }
}
