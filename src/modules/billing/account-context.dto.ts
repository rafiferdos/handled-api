import { ApiProperty } from '@nestjs/swagger';
import type { z } from 'zod';
import { CustomerResponseDto } from '../customer/customer.dto.js';
import { openApiSchema } from '../ai/contracts/openapi-schema.js';
import {
  ACCOUNT_CONTEXT_LIMIT,
  paymentProjectionSchema,
  subscriptionProjectionSchema,
  accessProjectionSchema,
} from './account-projections.js';
class AccountCountsDto {
  @ApiProperty({ minimum: 0, type: 'integer' }) payments: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) subscriptions: number;
  @ApiProperty({ minimum: 0, type: 'integer' }) productAccess: number;
}
export class AccountContextResponseDto {
  @ApiProperty({ type: () => CustomerResponseDto })
  customer: CustomerResponseDto;
  @ApiProperty({
    type: 'array',
    items: openApiSchema(paymentProjectionSchema),
    maxItems: ACCOUNT_CONTEXT_LIMIT,
  })
  payments: z.infer<typeof paymentProjectionSchema>[];
  @ApiProperty({
    type: 'array',
    items: openApiSchema(subscriptionProjectionSchema),
    maxItems: ACCOUNT_CONTEXT_LIMIT,
  })
  subscriptions: z.infer<typeof subscriptionProjectionSchema>[];
  @ApiProperty({
    type: 'array',
    items: openApiSchema(accessProjectionSchema),
    maxItems: ACCOUNT_CONTEXT_LIMIT,
  })
  productAccess: z.infer<typeof accessProjectionSchema>[];
  @ApiProperty({ type: () => AccountCountsDto }) counts: AccountCountsDto;
  @ApiProperty({ enum: [ACCOUNT_CONTEXT_LIMIT] }) limit: number;
}
