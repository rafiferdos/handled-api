import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(configService: ConfigService) {
    super({
      adapter: new PrismaPg({
        connectionString: configService.getOrThrow<string>('DATABASE_URL'),
        max: configService.getOrThrow<number>('DATABASE_POOL_MAX'),
        connectionTimeoutMillis: configService.getOrThrow<number>(
          'DATABASE_CONNECT_TIMEOUT_MS',
        ),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    // Driver adapters can open pools lazily; a query verifies credentials and TLS.
    await this.$queryRaw`SELECT 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
