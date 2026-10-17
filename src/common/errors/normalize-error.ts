import { HttpException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AppException } from './app.exception.js';
import type { ErrorDetails } from './app.exception.js';
import { ERROR_CATALOG, ErrorCode } from './error-codes.js';

export interface NormalizedError {
  status: number;
  code: ErrorCode;
  message: string;
  details: ErrorDetails;
}

function result(
  code: ErrorCode,
  details: ErrorDetails = null,
): NormalizedError {
  return { ...ERROR_CATALOG[code], code, details };
}

export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppException) {
    return result(error.code, error.details);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return result(ErrorCode.DUPLICATE_RESOURCE);
      case 'P2003':
      case 'P2025':
        return result(ErrorCode.RESOURCE_NOT_FOUND);
      case 'P2034':
        return result(ErrorCode.INVALID_STATE_TRANSITION);
      case 'P2010':
        return result(
          error.meta?.code === '57014'
            ? ErrorCode.DEPENDENCY_TIMEOUT
            : ErrorCode.INTERNAL_ERROR,
        );
      case 'P2028':
      case 'P2024':
        return result(ErrorCode.DEPENDENCY_TIMEOUT);
      default:
        return result(ErrorCode.INTERNAL_ERROR);
    }
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return result(ErrorCode.DEPENDENCY_UNAVAILABLE);
  }

  if (error instanceof HttpException) {
    // Native messages can contain request URLs, secrets or dependency details.
    const status = error.getStatus();
    const byStatus: Record<number, ErrorCode> = {
      400: ErrorCode.VALIDATION_ERROR,
      401: ErrorCode.UNAUTHENTICATED,
      403: ErrorCode.FORBIDDEN,
      404: ErrorCode.RESOURCE_NOT_FOUND,
      409: ErrorCode.DUPLICATE_RESOURCE,
      413: ErrorCode.PAYLOAD_TOO_LARGE,
      422: ErrorCode.BUSINESS_RULE_FAILED,
      429: ErrorCode.RATE_LIMITED,
      502: ErrorCode.AI_PROVIDER_ERROR,
      503: ErrorCode.DEPENDENCY_UNAVAILABLE,
      504: ErrorCode.DEPENDENCY_TIMEOUT,
    };
    const mapped = result(byStatus[status] ?? ErrorCode.INTERNAL_ERROR);
    // Preserve native HTTP semantics (e.g. 405/415) without echoing raw text.
    return { ...mapped, status };
  }

  // Express body-parser errors do not inherit from Nest HttpException.
  if (typeof error === 'object' && error !== null && 'type' in error) {
    if (error.type === 'entity.too.large') {
      return result(ErrorCode.PAYLOAD_TOO_LARGE);
    }
    if (error.type === 'entity.parse.failed') {
      return result(ErrorCode.VALIDATION_ERROR);
    }
  }
  return result(ErrorCode.INTERNAL_ERROR);
}
