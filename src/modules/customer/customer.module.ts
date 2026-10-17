import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { CustomerService } from './customer.service.js';
import { CustomerController } from './customer.controller.js';
@Module({
  imports: [BillingModule],
  controllers: [CustomerController],
  providers: [CustomerService],
  exports: [CustomerService],
})
export class CustomerModule {}
