import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { CorrelatedRequest } from '../middleware/request-context.middleware.js';

export const RequestId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | undefined =>
    context.switchToHttp().getRequest<CorrelatedRequest>().requestId,
);
