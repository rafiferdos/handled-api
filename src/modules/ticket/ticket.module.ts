import { PublicTicketService } from './public-ticket.service.js';
import {
  PublicTicketController,
  SupportFormController,
} from './public-ticket.controller.js';
import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service.js';
import { TicketStateService } from './ticket-state.service.js';
import { TicketController } from './ticket.controller.js';
@Module({
  controllers: [
    TicketController,
    PublicTicketController,
    SupportFormController,
  ],
  providers: [TicketService, TicketStateService, PublicTicketService],
  exports: [TicketService, TicketStateService],
})
export class TicketModule {}
