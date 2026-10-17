import { Global, Module } from '@nestjs/common';
import { JobRegistry, OutboxDispatcher } from './outbox-dispatcher.js';
import { QueueRuntime } from './queue-runtime.js';

@Global()
@Module({
  providers: [JobRegistry, OutboxDispatcher, QueueRuntime],
  exports: [JobRegistry, OutboxDispatcher, QueueRuntime],
})
export class QueueModule {}
