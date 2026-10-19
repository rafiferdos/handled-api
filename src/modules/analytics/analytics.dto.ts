import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

function toPositiveInt(value: unknown): unknown {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number(value);
  }
  return value;
}


export class AnalyticsWindowQueryDto {
  @ApiProperty({
    description: 'Number of days to look back from now (1..90).',
    default: 7,
    minimum: 1,
    maximum: 90,
  })
  @Transform(({ value }: { value: unknown }) => toPositiveInt(value))
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  windowDays: number = 7;
}

export class ActionOutcomeBucketDto {
  @ApiProperty()
  actionType!: string;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  succeeded!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty()
  outcomeUnknown!: number;

  @ApiProperty()
  avgLatencyMs!: number | null;
}

export class ActionOutcomesResponseDto {
  @ApiProperty()
  windowDays!: number;

  @ApiProperty({ type: [ActionOutcomeBucketDto] })
  buckets!: ActionOutcomeBucketDto[];

  @ApiProperty()
  totalExecutions!: number;
}

export class AuditThroughputResponseDto {
  @ApiProperty()
  windowDays!: number;

  @ApiProperty({ description: 'Per-subjectType counts over the window' })
  bySubject!: Record<string, number>;

  @ApiProperty()
  totalEvents!: number;
}

export class OutboxHealthResponseDto {
  @ApiProperty()
  pending!: number;

  @ApiProperty()
  claimed!: number;

  @ApiProperty()
  sent!: number;

  @ApiProperty()
  failed!: number;

  @ApiProperty({
    description: 'Average age in seconds of PENDING rows that are eligible now',
    nullable: true,
  })
  avgPendingAgeSeconds!: number | null;
}

export class AnalyticsSummaryResponseDto {
  @ApiProperty({ type: ActionOutcomesResponseDto })
  actions!: ActionOutcomesResponseDto;

  @ApiProperty({ type: AuditThroughputResponseDto })
  audit!: AuditThroughputResponseDto;

  @ApiProperty({ type: OutboxHealthResponseDto })
  outbox!: OutboxHealthResponseDto;
}
