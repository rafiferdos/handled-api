import { TicketCategory } from '../../../generated/prisma/enums.js';
import { ApiProperty } from '@nestjs/swagger';
import {
  ActionExecutionStatus,
  Confidence,
  ProposalStatus,
} from '../../../common/contracts/domain.enums.js';
import { ContractLimit } from '../../ai/contracts/contract-primitives.js';
import {
  nullableObjectProperty,
  openApiSchema,
} from '../../ai/contracts/openapi-schema.js';
import { ProposalDecisionKind } from '../../ai/contracts/workflow.contracts.js';
import type { ProposalOutput } from '../../ai/contracts/proposal-output.schema.js';
import { evidenceSourceSchema } from '../contracts/evidence.schema.js';
import type { EvidenceSource } from '../contracts/evidence.schema.js';
import { recommendationSchema } from '../contracts/recommendation.schema.js';
import type { Recommendation } from '../contracts/recommendation.schema.js';

export class ProposalContentDto implements ProposalOutput {
  @ApiProperty({ enum: TicketCategory })
  readonly category: ProposalOutput['category'];
  @ApiProperty({ maxLength: ContractLimit.SUMMARY, minLength: 1 })
  readonly summary: string;
  @ApiProperty({ enum: Confidence }) readonly confidence: Confidence;
  @ApiProperty({ type: [String], maxItems: ContractLimit.FACTS })
  readonly missingFacts: ProposalOutput['missingFacts'];
  @ApiProperty(nullableObjectProperty(recommendationSchema))
  readonly recommendation: Recommendation | null;
  @ApiProperty({ maxLength: ContractLimit.REPLY, minLength: 1 })
  readonly replyDraft: string;
  @ApiProperty({
    type: [String],
    maxItems: ContractLimit.SOURCES,
    uniqueItems: true,
  })
  readonly evidenceRefs: ProposalOutput['evidenceRefs'];
}

export class ProposalResponseDto extends ProposalContentDto {
  @ApiProperty({ format: 'uuid' }) readonly id: string;
  @ApiProperty({ format: 'uuid' }) readonly workspaceId: string;
  @ApiProperty({ format: 'uuid' }) readonly ticketId: string;
  @ApiProperty({ format: 'uuid' }) readonly investigationId: string;
  @ApiProperty({ type: 'integer', minimum: 1 }) readonly version: number;
  @ApiProperty({ enum: ProposalStatus }) readonly status: ProposalStatus;
  @ApiProperty({
    type: 'array',
    items: openApiSchema(evidenceSourceSchema),
    maxItems: ContractLimit.SOURCES,
  })
  readonly sources: readonly EvidenceSource[];
  @ApiProperty({ format: 'date-time' }) readonly createdAt: string;
}

export class ProposalDecisionResponseDto {
  @ApiProperty({ format: 'uuid' }) readonly decisionId: string;
  @ApiProperty({ format: 'uuid' }) readonly proposalId: string;
  @ApiProperty({ type: 'integer', minimum: 1 })
  readonly proposalVersion: number;
  @ApiProperty({ enum: ProposalDecisionKind })
  readonly decision: ProposalDecisionKind;
  @ApiProperty({ format: 'uuid' }) readonly actorUserId: string;
  @ApiProperty({
    type: String,
    nullable: true,
    maxLength: ContractLimit.REASON,
  })
  readonly reason: string | null;
  @ApiProperty({ format: 'date-time' }) readonly createdAt: string;
}

export class ActionAdmissionResponseDto {
  @ApiProperty({ format: 'uuid' }) readonly actionExecutionId: string;
  @ApiProperty({ enum: [ActionExecutionStatus.QUEUED] })
  readonly status: ActionExecutionStatus.QUEUED;
}
