import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './filters/global-exception.filter.js';
import { RequestContextService } from './context/request-context.service.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';

@Global()
@Module({
  providers: [
    RequestContextService,
    RequestContextMiddleware,
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
  ],
  exports: [RequestContextService, RequestContextMiddleware],
})
export class CommonModule {}
