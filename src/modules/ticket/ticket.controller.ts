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
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import {
  IdempotencyKey,
  RequireIdempotencyKey,
} from '../../common/decorators/idempotency-key.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
import { uuidPipe } from '../../common/dto/input.js';
import { TicketService } from './ticket.service.js';
import {
  CreateTicketDto,
  UpdateTicketDto,
  TicketQueryDto,
  AddMessageDto,
  AssignTicketDto,
  LinkCustomerDto,
  ManualTicketStatusDto,
  TicketReceiptDto,
  TicketResponseDto,
  MessageResponseDto,
} from './ticket.dto.js';
@ApiTags('Tickets')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId/tickets')
export class TicketController {
  constructor(@Inject(TicketService) private readonly tickets: TicketService) {}
  @Post()
  @RequireIdempotencyKey()
  @ApiSuccessResponse(TicketReceiptDto, { status: 201 })
  create(
    @CurrentActor() actor: WorkspaceActor,
    @IdempotencyKey() key: string,
    @Body() input: CreateTicketDto,
  ) {
    return this.tickets.create(actor, key, input);
  }
  @Get()
  @ApiSuccessResponse(TicketResponseDto, { paginated: true })
  list(@CurrentActor() actor: WorkspaceActor, @Query() query: TicketQueryDto) {
    return this.tickets.list(actor, query);
  }
  @Get(':ticketId')
  @ApiSuccessResponse(TicketResponseDto)
  detail(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
  ) {
    return this.tickets.detail(actor, id);
  }
  @Patch(':ticketId')
  @ApiSuccessResponse(TicketResponseDto)
  update(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Body() input: UpdateTicketDto,
  ) {
    return this.tickets.update(actor, id, input);
  }
  @Get(':ticketId/messages')
  @ApiSuccessResponse(MessageResponseDto, { paginated: true })
  messages(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.tickets.messages(actor, id, query);
  }
  @Post(':ticketId/messages')
  @ApiSuccessResponse(MessageResponseDto, { status: 201 })
  message(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Body() input: AddMessageDto,
  ) {
    return this.tickets.addMessage(actor, id, input);
  }
  @Patch(':ticketId/assignee')
  @ApiSuccessResponse(TicketResponseDto)
  assign(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Body() input: AssignTicketDto,
  ) {
    return this.tickets.assign(actor, id, input);
  }
  @Post(':ticketId/verify-customer')
  @HttpCode(200)
  @ApiSuccessResponse(TicketResponseDto)
  link(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Body() input: LinkCustomerDto,
  ) {
    return this.tickets.linkCustomer(actor, id, input);
  }
  @Patch(':ticketId/status')
  @ApiSuccessResponse(TicketResponseDto)
  status(
    @CurrentActor() actor: WorkspaceActor,
    @Param('ticketId', uuidPipe) id: string,
    @Body() input: ManualTicketStatusDto,
  ) {
    return this.tickets.manualStatus(actor, id, input);
  }
}
