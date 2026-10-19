import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ActionExecutionStatus,
  ActionType,
} from '../../../generated/prisma/client.js';


export class ActionExecutionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  workspaceId!: string;

  @ApiProperty({ enum: ActionType })
  actionType!: ActionType;

  @ApiProperty({ enum: ActionExecutionStatus })
  status!: ActionExecutionStatus;

  @ApiProperty({ maxLength: 256 })
  businessEffectKey!: string;

  @ApiProperty({ maxLength: 256 })
  idempotencyKey!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  ticketId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  proposalId!: string | null;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  customerId!: string | null;

  @ApiProperty({ format: 'uuid' })
  requestedBy!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  approvedBy!: string | null;

  @ApiProperty({ type: 'object', additionalProperties: true })
  payload!: Record<string, unknown>;

  @ApiProperty({ type: 'string', format: 'date-time' })
  queuedAt!: string;

  @ApiPropertyOptional({ type: 'string', format: 'date-time', nullable: true })
  startedAt!: string | null;

  @ApiPropertyOptional({ type: 'string', format: 'date-time', nullable: true })
  finishedAt!: string | null;


  @ApiPropertyOptional({ type: 'string', nullable: true, maxLength: 64 })
  lastErrorCode!: string | null;

  @ApiProperty({ type: 'string', format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ type: 'string', format: 'date-time' })
  updatedAt!: string;
}
