import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';
import { Optional, Trim, VersionDto } from '../../common/dto/input.js';

export class CreateWorkspaceDto {
  @ApiProperty({ maxLength: 100 })
  @Trim()
  @IsString()
  @Length(1, 100)
  name: string;
  @ApiProperty({ minLength: 3, maxLength: 40 })
  @Trim()
  @IsString()
  @Length(3, 40)
  @Matches(/^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/)
  slug: string;
}
export class UpdateWorkspaceDto extends VersionDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Optional()
  @Trim()
  @IsString()
  @Length(1, 100)
  name?: string;
}
export class WorkspaceResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() slug: string;
  @ApiProperty() name: string;
  @ApiProperty() version: number;
}
