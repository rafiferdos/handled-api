import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AccessContextGuard } from './guards/access-context.guard.js';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor.js';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { RequestContextService } from './context/request-context.service.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';

@Global()
@Module({
  providers: [
    RequestContextService,
    RequestContextMiddleware,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_GUARD, useClass: AccessContextGuard },
  ],
  exports: [RequestContextService, RequestContextMiddleware],
})
export class CommonModule {}
