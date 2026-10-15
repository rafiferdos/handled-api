import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsUUID, ValidateIf } from 'class-validator';
import { InvestigationStatus } from '../../../common/contracts/domain.enums.js';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto.js';
import { WorkspaceParamsDto } from '../../ai/dto/workspace-params.dto.js';

export class TicketInvestigationParamsDto extends WorkspaceParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  readonly ticketId: string;
}

export class InvestigationParamsDto extends WorkspaceParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  readonly investigationId: string;
}

export class InvestigationListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsUUID('all')
  readonly ticketId?: string;

  @ApiPropertyOptional({ enum: InvestigationStatus })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsEnum(InvestigationStatus)
  readonly status?: InvestigationStatus;
}
