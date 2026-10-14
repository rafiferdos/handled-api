import { ApiProperty } from '@nestjs/swagger';

export class AppInfoDto {
  @ApiProperty({ example: 'Handled API' })
  name: string;

  @ApiProperty({ example: 'v1' })
  apiVersion: string;

  @ApiProperty({ enum: ['starter'], example: 'starter' })
  status: 'starter';
}
