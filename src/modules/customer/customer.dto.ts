import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsString, Length } from 'class-validator';
import { CustomerStatus } from '../../generated/prisma/enums.js';
import { Optional, Trim, VersionDto } from '../../common/dto/input.js';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
export class CreateCustomerDto {
  @ApiProperty({ maxLength: 64 })
  @Trim()
  @IsString()
  @Length(1, 64)
  externalRef: string;
  @ApiProperty({ maxLength: 100 })
  @Trim()
  @IsString()
  @Length(1, 100)
  name: string;
  @ApiProperty({ format: 'email', maxLength: 320 })
  @Trim()
  @IsEmail()
  @Length(3, 320)
  email: string;
}
export class UpdateCustomerDto extends VersionDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Optional()
  @Trim()
  @IsString()
  @Length(1, 100)
  name?: string;
  @ApiPropertyOptional({ format: 'email', maxLength: 320 })
  @Optional()
  @Trim()
  @IsEmail()
  @Length(3, 320)
  email?: string;
  @ApiPropertyOptional({ enum: CustomerStatus })
  @Optional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
}
export class CustomerQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: CustomerStatus })
  @Optional()
  @IsEnum(CustomerStatus)
  status?: CustomerStatus;
  @ApiPropertyOptional({ maxLength: 100 })
  @Optional()
  @Trim()
  @IsString()
  @Length(1, 100)
  search?: string;
}
export class CustomerResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() externalRef: string;
  @ApiProperty() name: string;
  @ApiProperty({ format: 'email' }) email: string;
  @ApiProperty({ enum: CustomerStatus }) status: CustomerStatus;
  @ApiProperty() version: number;
}
