import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Length } from 'class-validator';
import { Optional, Trim } from '../../common/dto/input.js';

export class BootstrapProfileDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Optional()
  @Trim()
  @IsString()
  @Length(1, 100)
  displayName?: string;
}

export class ProfileResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true }) displayName: string | null;
}
