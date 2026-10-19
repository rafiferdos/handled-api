import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';
import { QueueModule } from '../queue/queue.module.js';

@Module({
  imports: [QueueModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
