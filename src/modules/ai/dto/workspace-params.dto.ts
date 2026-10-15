import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class WorkspaceParamsDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('all')
  readonly workspaceId: string;
}
