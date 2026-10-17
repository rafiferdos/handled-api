import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, IsUUID, Length, ValidateIf } from 'class-validator';
import {
  TicketCategory,
  TicketPriority,
  TicketStatus,
  MessageVisibility,
} from '../../generated/prisma/enums.js';
import { Optional, Trim, VersionDto } from '../../common/dto/input.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
export class CreateTicketDto {
  @ApiProperty({ maxLength: 256 })
  @Trim()
  @IsString()
  @Length(1, 256)
  subject: string;
  @ApiProperty({ maxLength: 10000 })
  @Trim()
  @IsString()
  @Length(1, 10000)
  body: string;
  @ApiPropertyOptional({ enum: TicketCategory })
  @Optional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;
  @ApiPropertyOptional({ enum: TicketPriority })
  @Optional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
export class UpdateTicketDto extends VersionDto {
  @ApiPropertyOptional({ maxLength: 256 })
  @Optional()
  @Trim()
  @IsString()
  @Length(1, 256)
  subject?: string;
  @ApiPropertyOptional({ enum: TicketCategory })
  @Optional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;
  @ApiPropertyOptional({ enum: TicketPriority })
  @Optional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
}
export class TicketQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: TicketStatus })
  @Optional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;
  @ApiPropertyOptional({ enum: TicketPriority })
  @Optional()
  @IsEnum(TicketPriority)
  priority?: TicketPriority;
  @ApiPropertyOptional({ enum: TicketCategory })
  @Optional()
  @IsEnum(TicketCategory)
  category?: TicketCategory;
  @ApiPropertyOptional({ format: 'uuid' })
  @Optional()
  @IsUUID()
  customerId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @Optional()
  @IsUUID()
  assigneeId?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @Optional()
  @Trim()
  @IsString()
  @Length(1, 100)
  search?: string;
}
export class AddMessageDto {
  @ApiProperty({ maxLength: 10000 })
  @Trim()
  @IsString()
  @Length(1, 10000)
  body: string;
  @ApiPropertyOptional({ enum: MessageVisibility, default: 'PUBLIC' })
  @Optional()
  @IsEnum(MessageVisibility)
  visibility?: MessageVisibility;
}
export class AssignTicketDto extends VersionDto {
  @ApiProperty({ format: 'uuid', type: String, nullable: true })
  @ValidateIf((_o: unknown, v: unknown) => v !== null)
  @IsUUID()
  assigneeId: string | null;
}
export class LinkCustomerDto extends VersionDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() customerId: string;
  @ApiProperty({
    maxLength: 2000,
    description:
      'Authenticated attestation explaining how the requester was verified.',
  })
  @Trim()
  @IsString()
  @Length(1, 2000)
  verificationReason: string;
}
export class ManualTicketStatusDto extends VersionDto {
  @ApiProperty({
    enum: TicketStatus,
    description: 'Only allowed human closure edges are accepted.',
  })
  @IsEnum(TicketStatus)
  status: TicketStatus;
}
export class TicketReceiptDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() reference: string;
  @ApiProperty({ enum: TicketStatus }) status: TicketStatus;
}
export class TicketResponseDto extends TicketReceiptDto {
  @ApiProperty() subject: string;
  @ApiProperty({ enum: TicketCategory, type: String, nullable: true })
  category: TicketCategory | null;
  @ApiProperty({ enum: TicketPriority }) priority: TicketPriority;
  @ApiProperty({ format: 'uuid', type: String, nullable: true }) customerId:
    string | null;
  @ApiProperty({ format: 'date-time', type: String, nullable: true })
  customerVerifiedAt: string | null;
  @ApiProperty({ format: 'uuid', type: String, nullable: true }) assigneeId:
    string | null;
  @ApiProperty() version: number;
  @ApiProperty() source: string;
  @ApiProperty({ type: String, nullable: true }) requesterEmail: string | null;
  @ApiProperty({ type: String, nullable: true }) requesterCustomerRef:
    string | null;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
  @ApiProperty({ format: 'date-time' }) updatedAt: string;
}
export class MessageResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() authorType: string;
  @ApiProperty({ enum: MessageVisibility }) visibility: MessageVisibility;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) authorUserId:
    string | null;
  @ApiProperty() body: string;
  @ApiProperty({ format: 'date-time' }) createdAt: string;
}
