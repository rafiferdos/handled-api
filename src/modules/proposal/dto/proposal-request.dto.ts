import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateBy,
  ValidateIf,
} from 'class-validator';
import { ContractLimit } from '../../ai/contracts/contract-primitives.js';
import { nullableObjectProperty } from '../../ai/contracts/openapi-schema.js';
import { WorkspaceParamsDto } from '../../ai/dto/workspace-params.dto.js';
import { recommendationSchema } from '../contracts/recommendation.schema.js';
import type { Recommendation } from '../contracts/recommendation.schema.js';

const nullableRecommendationSchema = recommendationSchema.nullable();

export class ProposalParamsDto extends WorkspaceParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  readonly proposalId: string;
}

export class VersionedProposalRequestDto {
  @ApiProperty({
    type: 'integer',
    minimum: 1,
    maximum: Number.MAX_SAFE_INTEGER,
    example: 1,
  })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  readonly expectedVersion: number;
}

export class ApproveProposalRequestDto extends VersionedProposalRequestDto {
  @ApiPropertyOptional({ maxLength: ContractLimit.REASON, minLength: 1 })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(ContractLimit.REASON)
  @Matches(/\S/)
  readonly reason?: string;
}

export class ReasonedProposalDecisionDto extends VersionedProposalRequestDto {
  @ApiProperty({ minLength: 1, maxLength: ContractLimit.REASON })
  @IsString()
  @MinLength(1)
  @MaxLength(ContractLimit.REASON)
  @Matches(/\S/)
  readonly reason: string;
}

// Complete editable content creates a new version; trusted confidence/sources,
// actor, status and tenant are always recomputed/resolved by the server.
export class EditProposalRequestDto extends VersionedProposalRequestDto {
  @ApiProperty({ minLength: 1, maxLength: ContractLimit.SUMMARY })
  @IsString()
  @MinLength(1)
  @MaxLength(ContractLimit.SUMMARY)
  @Matches(/\S/)
  readonly summary: string;

  @ApiProperty({ minLength: 1, maxLength: ContractLimit.REPLY })
  @IsString()
  @MinLength(1)
  @MaxLength(ContractLimit.REPLY)
  @Matches(/\S/)
  readonly replyDraft: string;

  @ApiProperty(nullableObjectProperty(recommendationSchema))
  @ValidateBy({
    name: 'isRecommendation',
    validator: {
      validate: (value: unknown) =>
        nullableRecommendationSchema.safeParse(value).success,
      defaultMessage: () => 'Must be an allowed recommendation or null',
    },
  })
  readonly recommendation: Recommendation | null;
}
