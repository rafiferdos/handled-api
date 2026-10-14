import { Catch, Inject, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';
import { RequestContextService } from '../context/request-context.service.js';
import type { CorrelatedRequest } from '../middleware/request-context.middleware.js';
import { normalizeError } from '../errors/normalize-error.js';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(
    @Inject(RequestContextService)
    private readonly context: RequestContextService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<CorrelatedRequest>();
    const response = http.getResponse<Response>();
    const error = normalizeError(exception);
    const requestId = this.context.get()?.requestId ?? request.requestId;

    if (error.status >= 500) {
      // Never log raw exceptions: DB/SDK messages may carry credentials or PII.
      this.logger.error({
        event: 'http.request.failed',
        ...this.context.get(),
        requestId,
        errorCode: error.code,
        statusCode: error.status,
      });
    }
    if (!response.headersSent) {
      response.status(error.status).json({
        error: { code: error.code, message: error.message, details: error.details },
        requestId,
        timestamp: new Date().toISOString(),
      });
    }
  }
}
