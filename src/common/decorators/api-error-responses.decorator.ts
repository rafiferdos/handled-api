import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ERROR_CATALOG } from '../errors/error-codes.js';
import type { ErrorCode } from '../errors/error-codes.js';

export function ApiErrorResponses(...codes: ErrorCode[]) {
  const statuses = new Map<number, ErrorCode[]>();
  for (const code of codes) {
    const status = ERROR_CATALOG[code].status;
    statuses.set(status, [...(statuses.get(status) ?? []), code]);
  }
  return applyDecorators(
    ...Array.from(statuses, ([status, groupedCodes]) =>
      ApiResponse({
        status,
        description: groupedCodes.join(', '),
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['error', 'requestId', 'timestamp'],
              properties: {
                error: {
                  type: 'object',
                  required: ['code', 'message', 'details'],
                  properties: {
                    code: { type: 'string', enum: groupedCodes },
                    message: { type: 'string' },
                    details: {
                      type: 'array',
                      nullable: true,
                      items: {
                        type: 'object',
                        required: ['field', 'messages'],
                        properties: {
                          field: { type: 'string' },
                          messages: {
                            type: 'array',
                            items: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
                requestId: { type: 'string' },
                timestamp: { type: 'string', format: 'date-time' },
              },
            },
            examples: Object.fromEntries(
              groupedCodes.map((code) => [
                code,
                {
                  value: {
                    error: {
                      code,
                      message: ERROR_CATALOG[code].message,
                      details: null,
                    },
                    requestId: 'req_example',
                    timestamp: '2026-10-14T00:00:00.000Z',
                  },
                },
              ]),
            ),
          },
        },
      }),
    ),
  );
}
