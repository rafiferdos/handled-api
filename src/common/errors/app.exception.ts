import { HttpException } from '@nestjs/common';
import { ERROR_CATALOG } from './error-codes.js';
import type { ErrorCode } from './error-codes.js';

export type ErrorDetails =
  | ReadonlyArray<{ field: string; messages: string[] }>
  | null;

export class AppException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    public readonly details: ErrorDetails = null,
  ) {
    const definition = ERROR_CATALOG[code];
    super(definition.message, definition.status);
  }
}
