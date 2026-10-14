import { Inject, Injectable } from '@nestjs/common';
import type {
  CallHandler,
  ExecutionContext,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { map } from 'rxjs';
import type { Observable } from 'rxjs';
import { RequestContextService } from '../context/request-context.service.js';
import { RAW_RESPONSE } from '../decorators/raw-response.decorator.js';
import { PaginatedResult } from '../http/api-response.js';

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(RequestContextService)
    private readonly context: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const raw = this.reflector.getAllAndOverride<boolean>(RAW_RESPONSE, [
      context.getHandler(),
      context.getClass(),
    ]);
    return next.handle().pipe(
      map((value: unknown) => {
        if (
          raw ||
          context.switchToHttp().getResponse<Response>().statusCode === 204
        ) {
          return value;
        }
        const requestId = this.context.get()?.requestId;
        if (value instanceof PaginatedResult) {
          return { data: value.data, meta: value.meta, requestId };
        }
        return { data: value ?? null, requestId };
      }),
    );
  }
}
