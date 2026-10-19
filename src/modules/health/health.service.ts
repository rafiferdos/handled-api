import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { QueueHealthIndicator } from '../queue/queue.health.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { HealthStatusDto, ReadinessStatusDto } from './health.dto.js';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(QueueHealthIndicator)
    private readonly queueHealth: QueueHealthIndicator,
  ) {}

  live(): HealthStatusDto {
    return { status: 'ok' };
  }

  async ready(): Promise<ReadinessStatusDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE);
    }

   
    let redis: 'connected' | 'unconfigured' | 'disconnected' = 'unconfigured';
    try {
      const result = await this.queueHealth.ready();
      redis = result.redis;
    } catch (err) {
      this.logger.warn(
        `Redis readiness check failed: ${err instanceof Error ? err.constructor.name : typeof err}`,
      );
      redis = 'disconnected';
      throw new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE);
    }

    return { status: 'ok', database: 'connected', redis };
  }
}
