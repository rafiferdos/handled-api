import { ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-codes.js';
import type { ErrorDetails } from '../errors/app.exception.js';

function validationDetails(
  errors: ValidationError[],
  parent = '',
): NonNullable<ErrorDetails> {
  const messages: Record<string, string> = {
    whitelistValidation: 'Unknown field',
    isInt: 'Must be an integer',
    min: 'Below the minimum allowed value',
    max: 'Above the maximum allowed value',
    isString: 'Must be a string',
    isEmail: 'Must be an email address',
    isUuid: 'Must be a UUID',
    isEnum: 'Must be an allowed value',
    isNotEmpty: 'Must not be empty',
    maxLength: 'Exceeds the maximum length',
    minLength: 'Below the minimum length',
  };
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    return [
      ...(error.constraints
        ? [
            {
              field,
              messages: Object.keys(error.constraints).map(
                (key) => messages[key] ?? 'Invalid value',
              ),
            },
          ]
        : []),
      ...validationDetails(error.children ?? [], field),
    ];
  });
}

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transformOptions: { enableImplicitConversion: false },
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new AppException(ErrorCode.VALIDATION_ERROR, validationDetails(errors)),
  });
}
