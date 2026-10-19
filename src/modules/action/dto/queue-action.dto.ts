import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
} from 'class-validator';
import { ActionType } from '../../../generated/prisma/client.js';


export class QueueActionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  proposalId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  decisionId!: string;

  @ApiProperty({ enum: ActionType })
  @IsEnum(ActionType)
  actionType!: ActionType;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @Length(1, 256)
  idempotencyKey!: string;

  @ApiProperty({ maxLength: 64, example: 'payment' })
  @IsString()
  @Length(1, 64)
  targetRef!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  targetId!: string;

  @ApiProperty({ minimum: 1, type: Number })
  @Type(() => Number)
  proposalVersion!: number;

  @ApiProperty({ minimum: 1, type: Number })
  @Type(() => Number)
  targetStateVersion!: number;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description:
      'Sanitized inputs forwarded to the simulated handler. Credentials, raw tokens and PII must be stripped by the caller.',
  })
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown> | null;
}
