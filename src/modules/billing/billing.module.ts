import { Module } from '@nestjs/common';
import { BillingReadService } from './billing-read.service.js';
@Module({ providers: [BillingReadService], exports: [BillingReadService] })
export class BillingModule {}
