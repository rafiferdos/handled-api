import {
  Body,
  Controller,
  Headers,
  Inject,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiHeader, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  Public,
  WorkspaceScoped,
} from '../../common/decorators/access.decorator.js';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import {
  IdempotencyKey,
  RequireIdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator.js';
import { RequestId } from '../../common/decorators/request-id.decorator.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { AppException } from '../../common/errors/app.exception.js';
import { PublicTicketService } from './public-ticket.service.js';
import {
  PublicTicketDto,
  IssueFormTokenDto,
  FormTokenResponseDto,
} from './public-ticket.dto.js';
import { TicketReceiptDto } from './ticket.dto.js';
@ApiTags('Public support')
@Controller('public/workspaces/:workspaceSlug/tickets')
export class PublicTicketController {
  constructor(
    @Inject(PublicTicketService) private readonly tickets: PublicTicketService,
  ) {}
  @Post()
  @Public()
  @RequireIdempotencyKey()
  @ApiHeader({ name: 'X-Support-Form-Token', required: true })
  @ApiHeader({ name: 'Origin', required: true })
  @ApiSuccessResponse(TicketReceiptDto, { status: 201 })
  create(
    @Param('workspaceSlug') slug: string,
    @Headers('x-support-form-token') token: string | undefined,
    @Headers('origin') origin: string | undefined,
    @Req() request: Request,
    @RequestId() requestId: string,
    @IdempotencyKey() key: string,
    @Body() input: PublicTicketDto,
  ) {
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug))
      throw new AppException('RESOURCE_NOT_FOUND');
    return this.tickets.create(
      slug,
      {
        token,
        origin,
        ip: request.ip || request.socket.remoteAddress || 'unknown',
        requestId,
      },
      key,
      input,
    );
  }
}
@ApiTags('Support form settings')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId/support-form')
export class SupportFormController {
  constructor(
    @Inject(PublicTicketService) private readonly tickets: PublicTicketService,
  ) {}
  @Post('token')
  @ApiSuccessResponse(FormTokenResponseDto, { status: 201 })
  issue(
    @CurrentActor() actor: WorkspaceActor,
    @Body() input: IssueFormTokenDto,
  ) {
    return this.tickets.issueToken(actor, input);
  }
}
