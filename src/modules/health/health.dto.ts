import { ApiProperty } from '@nestjs/swagger';

export class HealthStatusDto {
  @ApiProperty({ enum: ['ok'], example: 'ok' })
  status: 'ok';
}

export class ReadinessStatusDto extends HealthStatusDto {
  @ApiProperty({ enum: ['connected'], example: 'connected' })
  database: 'connected';
}
