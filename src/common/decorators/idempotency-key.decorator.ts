import {
  applyDecorators,
  createParamDecorator,
  SetMetadata,
} from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ApiHeader } from '@nestjs/swagger';
import type { IdempotentRequest } from '../guards/idempotency-key.guard.js';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-codes.js';

export const REQUIRE_IDEMPOTENCY_KEY = 'handled:idempotency-key';

// Header admission only. The domain must persist a scoped unique key + body hash.
export const RequireIdempotencyKey = () =>
  applyDecorators(
    SetMetadata(REQUIRE_IDEMPOTENCY_KEY, true),
    ApiHeader({
      name: 'Idempotency-Key',
      required: true,
      description:
        '1–128 letters, digits, dots, underscores or hyphens; UUID recommended',
    }),
  );

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const key = context
      .switchToHttp()
      .getRequest<IdempotentRequest>().idempotencyKey;
    if (!key) throw new AppException(ErrorCode.VALIDATION_ERROR);
    return key;
  },
);
