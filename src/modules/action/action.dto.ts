import { ApiProperty } from '@nestjs/swagger';
import {
  ActionExecutionStatus,
  ActionType,
} from '../../common/contracts/domain.enums.js';
export class ActionResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) ticketId: string;
  @ApiProperty({ format: 'uuid' }) proposalId: string;
  @ApiProperty() proposalVersion: number;
  @ApiProperty({ enum: ActionType }) type: ActionType;
  @ApiProperty() targetRef: string;
  @ApiProperty({ enum: ActionExecutionStatus }) status: ActionExecutionStatus;
  @ApiProperty() attempts: number;
  @ApiProperty() version: number;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  beforeState: unknown;
  @ApiProperty({ type: 'object', nullable: true, additionalProperties: true })
  afterState: unknown;
  @ApiProperty({ type: String, nullable: true }) failureCode: string | null;
  @ApiProperty() retryable: boolean;
  @ApiProperty({ example: true }) simulation: boolean;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' })
  finishedAt: string | null;
}
