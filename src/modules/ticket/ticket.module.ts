import { Module } from '@nestjs/common';
import { TicketService } from './ticket.service.js';
import { TicketStateService } from './ticket-state.service.js';
import { TicketController } from './ticket.controller.js';
@Module({
  controllers: [TicketController],
  providers: [TicketService, TicketStateService],
  exports: [TicketService, TicketStateService],
})
export class TicketModule {}
