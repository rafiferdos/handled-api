import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AuditSource,
  AuditSubjectType,
} from '../../../generated/prisma/client.js';

/**
 * Public projection of an immutable audit row. Only the fields needed by
 * clients are exposed; internal correlation fields remain server-side.
 */
export class AuditEventResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ enum: AuditSubjectType })
  subjectType!: AuditSubjectType;

  @ApiProperty({ format: 'uuid' })
  subjectId!: string;

  @ApiProperty({ example: 'ACTION_QUEUED' })
  action!: string;

  @ApiProperty({ format: 'uuid', nullable: true })
  actorId!: string | null;

  @ApiProperty({ enum: AuditSource })
  source!: AuditSource;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  metadata?: Record<string, unknown> | null;
}
