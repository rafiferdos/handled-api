import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsInt, IsString, Length, Max, Min } from 'class-validator';
import { Optional, Trim } from '../../common/dto/input.js';
export class PublicTicketDto {
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
  @ApiProperty({ format: 'email', maxLength: 320 })
  @Trim()
  @IsEmail()
  @Length(3, 320)
  requesterEmail: string;
  @ApiPropertyOptional({ maxLength: 64 })
  @Optional()
  @Trim()
  @IsString()
  @Length(1, 64)
  requesterCustomerRef?: string;
}
export class IssueFormTokenDto {
  @ApiPropertyOptional({ default: 168, minimum: 1, maximum: 720 })
  @IsInt()
  @Min(1)
  @Max(720)
  expiresInHours = 168;
}
export class FormTokenResponseDto {
  @ApiProperty() token: string;
  @ApiProperty({ format: 'date-time' }) expiresAt: string;
}
