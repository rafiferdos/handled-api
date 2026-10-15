import type { PipeTransform } from '@nestjs/common';
import { z } from 'zod';
import { AppException } from '../../../common/errors/app.exception.js';
import { ErrorCode } from '../../../common/errors/error-codes.js';

export const emptyInvestigationBodySchema = z.strictObject({});

// Start/retry take scope from verified route/identity, never from a model or body.
export class EmptyInvestigationBodyPipe implements PipeTransform<
  unknown,
  void
> {
  transform(value: unknown): void {
    if (
      value !== undefined &&
      !emptyInvestigationBodySchema.safeParse(value).success
    ) {
      throw new AppException(ErrorCode.VALIDATION_ERROR, [
        { field: 'body', messages: ['Request body must be empty'] },
      ]);
    }
  }
}
