import { applyDecorators } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

export function ApiSuccessResponse(
  model: Type<unknown>,
  options: { status?: number; paginated?: boolean; description?: string } = {},
) {
  const data = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description ?? 'Successful response',
      schema: {
        type: 'object',
        required: options.paginated ? ['data', 'meta', 'requestId'] : ['data', 'requestId'],
        properties: {
          data: options.paginated ? { type: 'array', items: data } : data,
          requestId: { type: 'string', example: 'req_example' },
          ...(options.paginated
            ? {
                meta: {
                  type: 'object' as const,
                  required: ['page', 'limit', 'total', 'hasNext'],
                  properties: {
                    page: { type: 'integer' as const, example: 1 },
                    limit: { type: 'integer' as const, example: 20 },
                    total: { type: 'integer' as const, example: 42 },
                    hasNext: { type: 'boolean' as const, example: true },
                  },
                },
              }
            : {}),
        },
      },
    }),
  );
}
