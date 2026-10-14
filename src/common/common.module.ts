import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AccessContextGuard } from './guards/access-context.guard.js';
import { IdempotencyKeyGuard } from './guards/idempotency-key.guard.js';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { RequestContextService } from './context/request-context.service.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';

@Global()
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.getOrThrow<number>('THROTTLE_TTL_MS'),
            limit: config.getOrThrow<number>('THROTTLE_LIMIT'),
          },
        ],
      }),
    }),
  ],
  providers: [
    RequestContextService,
    RequestContextMiddleware,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessContextGuard },
    { provide: APP_GUARD, useClass: IdempotencyKeyGuard },
  ],
  exports: [RequestContextService, RequestContextMiddleware],
})
export class CommonModule {}
