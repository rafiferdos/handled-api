import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { UnitOfWork } from './unit-of-work.js';
import { IdempotencyService } from './idempotency.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PrismaService, UnitOfWork, IdempotencyService],
  exports: [PrismaService, UnitOfWork, IdempotencyService],
})
export class DatabaseModule {}
