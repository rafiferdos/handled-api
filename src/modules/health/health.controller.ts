import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service.js';
import { HealthStatusDto, ReadinessStatusDto } from './health.dto.js';
import { ApiErrorResponses } from '../../common/decorators/api-error-responses.decorator.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { RawResponse } from '../../common/decorators/raw-response.decorator.js';
import { Public } from '../../common/decorators/access.decorator.js';
import { SkipThrottle } from '@nestjs/throttler';

@ApiTags('Health')
@RawResponse()
@Public()
@SkipThrottle()
@Controller()
export class HealthController {
  constructor(@Inject(HealthService) private readonly health: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'Process liveness' })
  @ApiOkResponse({ type: HealthStatusDto })
  live(): HealthStatusDto {
    return this.health.live();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Database readiness' })
  @ApiOkResponse({ type: ReadinessStatusDto })
  @ApiErrorResponses(ErrorCode.DEPENDENCY_UNAVAILABLE)
  ready(): Promise<ReadinessStatusDto> {
    return this.health.ready();
  }
}
