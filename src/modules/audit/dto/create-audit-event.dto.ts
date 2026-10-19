import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
} from 'class-validator';
import {
  AuditSource,
  AuditSubjectType,
} from '../../../generated/prisma/client.js';

/**
 * Parameters for appending an immutable audit event. Callers are responsible
 * for stripping credentials, raw tokens and customer PII from `metadata` before
 * passing it in; the service layer does not perform redaction.
 */
export class CreateAuditEventDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  workspaceId!: string;

  @ApiProperty({ enum: AuditSubjectType })
  @IsEnum(AuditSubjectType)
  subjectType!: AuditSubjectType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  subjectId!: string;

  @ApiProperty({ example: 'ACTION_QUEUED', maxLength: 128 })
  @IsString()
  @Length(1, 128)
  action!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ enum: AuditSource, default: AuditSource.API })
  @IsOptional()
  @IsEnum(AuditSource)
  source?: AuditSource;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  businessEffectKey?: string;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  idempotencyKey?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description:
      'Sanitized metadata. Credentials, raw tokens and PII must be stripped by the caller.',
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown> | null;
}
