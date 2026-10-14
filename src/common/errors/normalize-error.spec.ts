import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AppException } from './app.exception.js';
import { ErrorCode } from './error-codes.js';
import { normalizeError } from './normalize-error.js';

describe('normalizeError', () => {
  it.each([
    ['P2002', 409, ErrorCode.DUPLICATE_RESOURCE],
    ['P2003', 404, ErrorCode.RESOURCE_NOT_FOUND],
    ['P2025', 404, ErrorCode.RESOURCE_NOT_FOUND],
    ['P2024', 504, ErrorCode.DEPENDENCY_TIMEOUT],
    ['P9999', 500, ErrorCode.INTERNAL_ERROR],
  ])('maps Prisma %s without exposing metadata', (code, status, expected) => {
    const error = new Prisma.PrismaClientKnownRequestError('secret-password', {
      code,
      clientVersion: '7.10.0',
      meta: { target: 'private-customer-email' },
    });
    expect(normalizeError(error)).toMatchObject({ status, code: expected });
    expect(JSON.stringify(normalizeError(error))).not.toMatch(/secret|private/);
  });

  it('never echoes raw server or unknown-route messages', () => {
    for (const error of [
      new Error('secret-password'),
      new ServiceUnavailableException('secret-password'),
      new NotFoundException('Cannot GET /?token=secret-password'),
    ]) {
      expect(JSON.stringify(normalizeError(error))).not.toContain('secret');
    }
  });

  it('preserves explicit domain codes and safe validation details', () => {
    expect(
      normalizeError(new AppException(ErrorCode.PROPOSAL_VERSION_CONFLICT)),
    ).toMatchObject({ status: 409, code: ErrorCode.PROPOSAL_VERSION_CONFLICT });
    expect(
      normalizeError(
        new AppException(ErrorCode.VALIDATION_ERROR, [
          { field: 'page', messages: ['page must be an integer number'] },
        ]),
      ).details,
    ).toEqual([{ field: 'page', messages: ['page must be an integer number'] }]);
  });
});
