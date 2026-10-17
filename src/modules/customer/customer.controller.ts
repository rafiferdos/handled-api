import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentActor } from '../../common/decorators/actor.decorator.js';
import { WorkspaceScoped } from '../../common/decorators/access.decorator.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { uuidPipe } from '../../common/dto/input.js';
import { ApiSuccessResponse } from '../../common/decorators/api-success-response.decorator.js';
import { BillingReadService } from '../billing/billing-read.service.js';
import { CustomerService } from './customer.service.js';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  CustomerQueryDto,
  CustomerResponseDto,
} from './customer.dto.js';
@ApiTags('Customers')
@ApiBearerAuth()
@WorkspaceScoped()
@ApiParam({ name: 'workspaceId', format: 'uuid' })
@Controller('workspaces/:workspaceId/customers')
export class CustomerController {
  constructor(
    @Inject(CustomerService) private readonly customers: CustomerService,
    @Inject(BillingReadService) private readonly billing: BillingReadService,
  ) {}
  @Post() @ApiSuccessResponse(CustomerResponseDto, { status: 201 }) create(
    @CurrentActor() actor: WorkspaceActor,
    @Body() input: CreateCustomerDto,
  ) {
    return this.customers.create(actor, input);
  }
  @Get() @ApiSuccessResponse(CustomerResponseDto, { paginated: true }) list(
    @CurrentActor() actor: WorkspaceActor,
    @Query() query: CustomerQueryDto,
  ) {
    return this.customers.list(actor, query);
  }
  @Get(':customerId') @ApiSuccessResponse(CustomerResponseDto) detail(
    @CurrentActor() actor: WorkspaceActor,
    @Param('customerId', uuidPipe) id: string,
  ) {
    return this.customers.detail(actor, id);
  }
  @Patch(':customerId') @ApiSuccessResponse(CustomerResponseDto) update(
    @CurrentActor() actor: WorkspaceActor,
    @Param('customerId', uuidPipe) id: string,
    @Body() input: UpdateCustomerDto,
  ) {
    return this.customers.update(actor, id, input);
  }
  @Get(':customerId/account-context') context(
    @CurrentActor() actor: WorkspaceActor,
    @Param('customerId', uuidPipe) id: string,
  ) {
    return this.billing.context(actor, id);
  }
}
