import { Module } from '@nestjs/common';
import { ActionPolicy } from './action-policy.js';

@Module({ providers: [ActionPolicy], exports: [ActionPolicy] })
export class ActionModule {}
