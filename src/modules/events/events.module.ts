import { Module } from '@nestjs/common';
import { SupportGateway } from './support.gateway.js';

@Module({
  providers: [SupportGateway],
  exports: [SupportGateway],
})
export class EventsModule {}
