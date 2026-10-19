import { Module } from '@nestjs/common';
import { ActionController } from './action.controller.js';
import { ActionService } from './action.service.js';
import { AuditModule } from '../audit/audit.module.js';
import { QueueModule } from '../queue/queue.module.js';

@Module({
  imports: [QueueModule, AuditModule],
  controllers: [ActionController],
  providers: [ActionService],
  exports: [ActionService],
})
export class ActionModule {}
