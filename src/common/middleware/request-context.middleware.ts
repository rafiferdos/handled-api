import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service.js';

export interface CorrelatedRequest extends Request {
  requestId?: string;
}

@Injectable()
export class RequestContextMiddleware {
  private readonly logger = new Logger('HTTP');

  constructor(
    @Inject(RequestContextService)
    private readonly context: RequestContextService,
  ) {}

  use(req: CorrelatedRequest, res: Response, next: NextFunction): void {
    const suppliedId = req.headers['x-request-id'];
    const requestId =
      typeof suppliedId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(suppliedId)
        ? suppliedId
        : randomUUID();
    const context = { requestId, traceId: randomBytes(16).toString('hex') };
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    const startedAt = performance.now();

    this.context.run(context, () => {
      res.once('finish', () => {
        // Route templates exclude raw IDs, query strings, headers and bodies.
        const route = req.route as { path?: unknown } | undefined;
        this.logger.log({
          event: 'http.request.completed',
          ...context,
          method: req.method,
          route: typeof route?.path === 'string' ? route.path : '[unmatched]',
          statusCode: res.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        });
      });
      next();
    });
  }
}
