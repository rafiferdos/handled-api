import { Global, Module } from '@nestjs/common';
import { JobRegistry, OutboxDispatcher } from './outbox-dispatcher.js';
import { QueueRuntime } from './queue-runtime.js';
import { QueueAdminService } from './queue-admin.service.js';
import { QueueAdminController } from './queue-admin.controller.js';

@Global()
@Module({
  providers: [JobRegistry, OutboxDispatcher, QueueRuntime, QueueAdminService],
  controllers: [QueueAdminController],
  exports: [JobRegistry, OutboxDispatcher, QueueRuntime],
})
export class QueueModule {}
