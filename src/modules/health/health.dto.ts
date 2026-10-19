import { ApiProperty } from '@nestjs/swagger';

export class HealthStatusDto {
  @ApiProperty({ example: 'ok' })
  status!: string;
}

export class ReadinessStatusDto {
  @ApiProperty({ example: 'ok' })
  status!: string;

  @ApiProperty({ example: 'connected' })
  database!: string;

  @ApiProperty({
    example: 'connected',
    description:
      "Worker queue readiness. 'connected' when the configured Redis ping succeeded, 'unconfigured' when no REDIS_URL is set (local dev only), 'disconnected' otherwise.",
    enum: ['connected', 'unconfigured', 'disconnected'],
  })
  redis!: 'connected' | 'unconfigured' | 'disconnected';
}
