import { Global, Module } from '@nestjs/common';
import { RequestContextService } from './context/request-context.service.js';
import { RequestContextMiddleware } from './middleware/request-context.middleware.js';

@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware],
  exports: [RequestContextService, RequestContextMiddleware],
})
export class CommonModule {}
