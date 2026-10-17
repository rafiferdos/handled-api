import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateBy,
} from 'class-validator';
import { Optional, Trim, VersionDto } from '../../common/dto/input.js';
import { policyRulesSchema } from './policy-rules.js';
import type { PolicyRules } from './policy-rules.js';
export class CreateKnowledgeDto {
  @ApiProperty({
    example: 'duplicate-payment-policy',
    minLength: 3,
    maxLength: 100,
  })
  @Trim()
  @IsString()
  @Length(3, 100)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  slug: string;
  @ApiProperty({ example: 'Duplicate payment refunds', maxLength: 256 })
  @Trim()
  @IsString()
  @Length(1, 256)
  title: string;
  @ApiProperty({ maxLength: 100000 })
  @Trim()
  @IsString()
  @Length(1, 100000)
  body: string;
  @ApiProperty({
    type: 'object',
    additionalProperties: false,
    properties: {
      allowedActions: {
        type: 'array',
        items: {
          type: 'string',
          enum: [
            'REFUND_DUPLICATE_PAYMENT',
            'CANCEL_AT_PERIOD_END',
            'RESTORE_PRODUCT_ACCESS',
          ],
        },
      },
      maxRefundMinor: { type: 'integer', minimum: 1, maximum: 2147483647 },
    },
    required: ['allowedActions'],
    example: {
      allowedActions: ['REFUND_DUPLICATE_PAYMENT'],
      maxRefundMinor: 10000,
    },
  })
  @ValidateBy({
    name: 'policyRules',
    validator: {
      validate: (v: unknown) => policyRulesSchema.safeParse(v).success,
    },
  })
  policyRules: PolicyRules;
}
export class UpdateKnowledgeDto extends CreateKnowledgeDto {
  @ApiProperty({ minimum: 1, maximum: 2147483647 })
  @IsInt()
  @Min(1)
  @Max(2147483647)
  expectedVersion: number;
}
export class KnowledgeSearchDto {
  @ApiProperty({ maxLength: 1000, example: 'duplicate charge refund policy' })
  @Trim()
  @IsString()
  @Length(1, 1000)
  query: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 20, default: 5 })
  @Optional()
  @IsInt()
  @Min(1)
  @Max(20)
  topK?: number;
}
export class KnowledgeDocumentDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty({ enum: ['DRAFT', 'PUBLISHED', 'ARCHIVED'] }) status: string;
  @ApiProperty() version: number;
  @ApiProperty({ type: 'integer', nullable: true }) publishedVersion:
    number | null;
}
export class KnowledgeSourceDto {
  @ApiProperty() sourceRefId: string;
  @ApiProperty({ format: 'uuid' }) documentId: string;
  @ApiProperty() documentVersion: number;
  @ApiProperty({ format: 'uuid' }) chunkId: string;
  @ApiProperty() title: string;
  @ApiProperty() excerpt: string;
  @ApiProperty() contentHash: string;
  @ApiProperty({ format: 'date-time' }) observedAt: string;
  @ApiProperty() score: number;
}
export class KnowledgeSearchResponseDto {
  @ApiProperty({ type: [KnowledgeSourceDto] }) sources: KnowledgeSourceDto[];
}
export { VersionDto };
