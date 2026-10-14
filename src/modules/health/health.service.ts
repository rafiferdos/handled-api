import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AppException } from '../../common/errors/app.exception.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import type { HealthStatusDto, ReadinessStatusDto } from './health.dto.js';

@Injectable()
export class HealthService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  live(): HealthStatusDto {
    return { status: 'ok' };
  }

  async ready(): Promise<ReadinessStatusDto> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE);
    }
  }
}
