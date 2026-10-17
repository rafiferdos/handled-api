import { ApiProperty } from '@nestjs/swagger';
import { InvestigationStatus } from '../../../common/contracts/domain.enums.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';
import { ContractLimit } from '../../ai/contracts/contract-primitives.js';
import {
  InvestigationStepStatus,
  InvestigationStepType,
} from '../../ai/contracts/workflow.contracts.js';
import { ProposalResponseDto } from '../../proposal/dto/proposal-response.dto.js';

export class InvestigationAdmissionResponseDto {
  @ApiProperty({ format: 'uuid' }) readonly investigationId: string;
  @ApiProperty({
    enum: [InvestigationStatus.QUEUED, InvestigationStatus.RUNNING],
    description:
      'An active run is coalesced; this is admission, not completion.',
  })
  readonly status: InvestigationStatus.QUEUED | InvestigationStatus.RUNNING;
}

export class InvestigationSummaryDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly workspaceId: string;
  @ApiProperty({ format: 'uuid' }) readonly ticketId: string;
  @ApiProperty({ enum: InvestigationStatus })
  readonly status: InvestigationStatus;
  @ApiProperty({ format: 'uuid' }) readonly triggeredByUserId: string;
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Actual configured model, absent before provider selection',
  })
  readonly model: string | null;
  @ApiProperty({ type: String, nullable: true }) readonly promptVersion:
    string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly startedAt: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  readonly finishedAt: string | null;
  @ApiProperty({ type: String, enum: ErrorCode, nullable: true })
  readonly failureCode: ErrorCode | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt: string;
}

export class InvestigationStepDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) readonly sequence: number;
  @ApiProperty({ enum: InvestigationStepType })
  readonly type: InvestigationStepType;
  @ApiProperty({
    maxLength: 256,
    description: 'Recorded operation label, never hidden model reasoning',
  })
  readonly label: string;
  @ApiProperty({ enum: InvestigationStepStatus })
  readonly status: InvestigationStepStatus;
  @ApiProperty({ type: String, nullable: true }) readonly toolName:
    string | null;
  @ApiProperty({ type: [String], maxItems: ContractLimit.SOURCES })
  readonly sourceRefs: readonly string[];
  @ApiProperty({ type: 'integer', minimum: 0, nullable: true })
  readonly durationMs: number | null;
  @ApiProperty({ type: String, enum: ErrorCode, nullable: true })
  readonly errorCode: ErrorCode | null;
}

export class InvestigationDetailDto extends InvestigationSummaryDto {
  @ApiProperty({ type: [InvestigationStepDto] })
  readonly steps: readonly InvestigationStepDto[];
  @ApiProperty({ type: () => ProposalResponseDto, nullable: true })
  readonly proposal: ProposalResponseDto | null;
}
