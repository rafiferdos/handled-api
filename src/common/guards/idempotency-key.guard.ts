import { Inject, Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { REQUIRE_IDEMPOTENCY_KEY } from '../decorators/idempotency-key.decorator.js';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-codes.js';
import { isIdempotencyKey } from '../contracts/idempotency.contracts.js';

export interface IdempotentRequest extends Request {
  idempotencyKey?: string;
}

@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (
      !this.reflector.getAllAndOverride<boolean>(REQUIRE_IDEMPOTENCY_KEY, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }
    const request = context.switchToHttp().getRequest<IdempotentRequest>();
    const key = request.headers['idempotency-key'];
    if (!isIdempotencyKey(key)) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, [
        {
          field: 'Idempotency-Key',
          messages: ['A valid Idempotency-Key header is required'],
        },
      ]);
    }
    request.idempotencyKey = key;
    return true;
  }
}
