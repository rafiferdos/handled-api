import { ValidationPipe } from '@nestjs/common';
import { PaginationQueryDto } from '../dto/pagination-query.dto.js';
import { paginationBounds, paginated } from './pagination.js';

describe('pagination contract', () => {
  const pipe = new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  const metadata = { type: 'query' as const, metatype: PaginationQueryDto };

  it('uses bounded defaults and computes next-page metadata from total count', async () => {
    const query = (await pipe.transform({}, metadata)) as PaginationQueryDto;
    expect(paginationBounds(query)).toEqual({ skip: 0, take: 20 });
    expect(paginated([], 0, query).meta.hasNext).toBe(false);
    expect(paginated([1], 21, query).meta.hasNext).toBe(true);
    const lastPage = (await pipe.transform(
      { page: '2', limit: '20' },
      metadata,
    )) as PaginationQueryDto;
    expect(paginationBounds(lastPage)).toEqual({ skip: 20, take: 20 });
    expect(paginated([1], 21, lastPage).meta.hasNext).toBe(false);
  });

  it.each([
    { limit: '101' },
    { page: '0' },
    { page: '1.5' },
    { page: '1e3' },
    { limit: ['1', '2'] },
    { page: '' },
    { orderBy: 'password' },
  ])('rejects invalid or unknown query values: %j', async (query) => {
    await expect(pipe.transform(query, metadata)).rejects.toThrow();
  });

  it('rejects offsets beyond safe integer precision', () => {
    const query = Object.assign(new PaginationQueryDto(), {
      page: Number.MAX_SAFE_INTEGER,
    });
    expect(() => paginationBounds(query)).toThrow();
  });
});

it('rejects fractional and invalid internal pagination before Prisma receives an offset', () => {
  for (const query of [
    { page: 1.5, limit: 20 },
    { page: 0, limit: 20 },
    { page: 1, limit: 0 },
    { page: 2147483648, limit: 2 },
  ])
    expect(() => paginationBounds(query)).toThrow();
});
