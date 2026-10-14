import type { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import { AppException } from '../errors/app.exception.js';
import { ErrorCode } from '../errors/error-codes.js';
import { PaginatedResult } from '../http/api-response.js';

export function paginationBounds(query: PaginationQueryDto): {
  skip: number;
  take: number;
} {
  const skip = (query.page - 1) * query.limit;
  if (!Number.isSafeInteger(skip)) {
    throw new AppException(ErrorCode.VALIDATION_ERROR, [
      { field: 'page', messages: ['Pagination offset is too large'] },
    ]);
  }
  return { skip, take: query.limit };
}

export function paginated<T>(
  data: T[],
  total: number,
  query: PaginationQueryDto,
): PaginatedResult<T> {
  const { skip, take } = paginationBounds(query);
  return new PaginatedResult(data, {
    page: query.page,
    limit: take,
    total,
    hasNext: skip + take < total,
  });
}
