import { Module } from '@nestjs/common';
import { ActionPolicy } from './action-policy.js';
import { ActionService } from './action.service.js';
import { ActionProcessor } from './action-processor.js';
import { ActionController } from './action.controller.js';

@Module({
  providers: [ActionPolicy, ActionService, ActionProcessor],
  controllers: [ActionController],
  exports: [ActionPolicy, ActionService],
})
export class ActionModule {}
