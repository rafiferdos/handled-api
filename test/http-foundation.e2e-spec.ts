import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import {
  AccessContextResolver,
  WorkspaceRole,
} from '../src/common/contracts/access-context.js';
import type {
  AuthenticatedUser,
  WorkspaceMembership,
} from '../src/common/contracts/access-context.js';
import {
  CurrentUser,
  CurrentWorkspace,
  Public,
  Roles,
  WorkspaceScoped,
} from '../src/common/decorators/access.decorator.js';
import { ApiSuccessResponse } from '../src/common/decorators/api-success-response.decorator.js';
import { ApiErrorResponses } from '../src/common/decorators/api-error-responses.decorator.js';
import {
  IdempotencyKey,
  RequireIdempotencyKey,
} from '../src/common/decorators/idempotency-key.decorator.js';
import { PaginationQueryDto } from '../src/common/dto/pagination-query.dto.js';
import { AppException } from '../src/common/errors/app.exception.js';
import { ErrorCode } from '../src/common/errors/error-codes.js';
import { paginated } from '../src/common/utils/pagination.js';
import { configureApp } from '../src/config/configure-app.js';

class CountDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  count: number;
}

class ItemDto {
  @ApiProperty()
  id: string;
}


@Controller('foundation-fixture')
class FoundationFixtureController {
  @Public()
  @Post('count')
  @RequireIdempotencyKey()
  @ApiSuccessResponse(CountDto, { status: 201 })
  @ApiErrorResponses(ErrorCode.VALIDATION_ERROR, ErrorCode.IDEMPOTENCY_CONFLICT)
  count(@Body() body: CountDto, @IdempotencyKey() key: string) {
    return { count: body.count, key };
  }

  @Public()
  @Get('list')
  @ApiSuccessResponse(ItemDto, { paginated: true })
  list(@Query() query: PaginationQueryDto) {
    return paginated([{ id: 'item' }], 21, query);
  }

  @Public()
  @Get('data-field')
  dataField() {
    return { data: 'domain-owned-field' };
  }

  @Public()
  @Get('boom')
  boom() {
    throw new Error('private-database-password');
  }

  @Public()
  @Get('conflict')
  conflict() {
    throw new AppException(ErrorCode.PROPOSAL_VERSION_CONFLICT);
  }

  @Public()
  @Delete('empty')
  @HttpCode(204)
  empty() {}

  @Get('private')
  privateRoute(@CurrentUser() user: AuthenticatedUser) {
    return { userId: user.id };
  }

  @Public()
  @Get('throttled')
  throttled() {
    return { ok: true };
  }
}

@Controller('workspaces/:workspaceId/foundation-fixture')
@WorkspaceScoped()
class WorkspaceFixtureController {
  @Get()
  read(@CurrentWorkspace() membership: WorkspaceMembership) {
    return { workspaceId: membership.workspaceId };
  }

  @Get('admin')
  @Roles(WorkspaceRole.ADMIN)
  admin() {
    return { allowed: true };
  }
}

describe('shared HTTP foundation', () => {
  const workspaceId = 'a62c1b46-3429-4e12-b7d2-4a01be581a01';
  const otherWorkspaceId = '5d8c536b-86aa-456d-9bbf-9b1bd58406c3';
  const base = '/api/v1/foundation-fixture';
  let app: NestExpressApplication;
  let role: WorkspaceRole;

  beforeEach(async () => {
    role = WorkspaceRole.VIEWER;
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FoundationFixtureController, WorkspaceFixtureController],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn(),
        onModuleDestroy: vi.fn(),
        $queryRaw: vi.fn().mockResolvedValue([1]),
      })
      .overrideProvider(AccessContextResolver)
      .useValue({
        authenticate: (req: { headers: Record<string, string> }) =>
          Promise.resolve(
            req.headers.authorization === 'Bearer test-identity'
              ? { id: 'test-user' }
              : null,
          ),
        resolveMembership: (userId: string, requestedWorkspace: string) =>
          Promise.resolve(
            requestedWorkspace === workspaceId
              ? {
                  id: 'membership',
                  userId,
                  workspaceId,
                  role,
                  status: 'ACTIVE',
                }
              : null,
          ),
      })
      .compile();
    app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('correlates success and error envelopes with the response header', async () => {
    const success = await request(app.getHttpServer())
      .get('/api/v1')
      .set('X-Request-Id', 'req_test')
      .expect(200);
    expect(success.headers['x-request-id']).toBe('req_test');
    expect(success.body.requestId).toBe('req_test');
    const error = await request(app.getHttpServer())
      .get(`${base}/conflict`)
      .set('X-Request-Id', 'req_test')
      .expect(409);
    expect(error.body).toMatchObject({
      error: { code: 'PROPOSAL_VERSION_CONFLICT', details: null },
      requestId: 'req_test',
    });
    expect(Number.isNaN(Date.parse(error.body.timestamp))).toBe(false);
  });

  it('replaces oversized request IDs and does not log secrets or query strings', async () => {
    const logs = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    const errors = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const response = await request(app.getHttpServer())
      .get(`${base}/boom?token=private-query-secret`)
      .set('X-Request-Id', 'x'.repeat(65))
      .set('Authorization', 'Bearer private-header-secret')
      .expect(500);
    expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(response.body.error.code).toBe('INTERNAL_ERROR');
    expect(
      JSON.stringify([response.body, logs.mock.calls, errors.mock.calls]),
    ).not.toContain('private-');
  });

  it('preserves domain objects with a data property and empty 204 responses', async () => {
    const response = await request(app.getHttpServer())
      .get(`${base}/data-field`)
      .expect(200);
    expect(response.body.data).toEqual({ data: 'domain-owned-field' });
    const empty = await request(app.getHttpServer())
      .delete(`${base}/empty`)
      .expect(204);
    expect(empty.text).toBe('');
  });

  it('returns pagination metadata without double wrapping', async () => {
    const response = await request(app.getHttpServer())
      .get(`${base}/list?page=2&limit=20`)
      .expect(200);
    expect(response.body.data).toEqual([{ id: 'item' }]);
    expect(response.body.meta).toEqual({
      page: 2,
      limit: 20,
      total: 21,
      hasNext: false,
    });
  });

  it.each([
    'limit=101',
    'page=0',
    'page=1.2',
    'page=1&page=2',
    'sort=password',
  ])('rejects invalid pagination: %s', async (query) => {
    const response = await request(app.getHttpServer())
      .get(`${base}/list?${query}`)
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.length).toBeGreaterThan(0);
  });

  it('accepts a validated body and exposes the admitted idempotency key', async () => {
    const response = await request(app.getHttpServer())
      .post(`${base}/count`)
      .set('Idempotency-Key', 'test-key')
      .send({ count: 3 })
      .expect(201);
    expect(response.body.data).toEqual({ count: 3, key: 'test-key' });
  });

  it.each([undefined, ' ', 'x'.repeat(129), 'key,another-key'])(
    'rejects missing or malformed idempotency key: %s',
    async (key) => {
      const call = request(app.getHttpServer()).post(`${base}/count`);
      if (key !== undefined) call.set('Idempotency-Key', key);
      const response = await call.send({ count: 3 }).expect(400);
      expect(response.body.error.details[0].field).toBe('Idempotency-Key');
    },
  );

  it.each([
    { count: '3' },
    { count: 0 },
    { count: 3, password: 'private-body-secret' },
  ])(
    'rejects invalid or unknown DTO fields without echoing values: %j',
    async (body) => {
      const response = await request(app.getHttpServer())
        .post(`${base}/count`)
        .set('Idempotency-Key', 'test-key')
        .send(body)
        .expect(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.text).not.toContain('private-body-secret');
    },
  );

  it('correlates malformed JSON errors before controller dispatch', async () => {
    const response = await request(app.getHttpServer())
      .post(`${base}/count`)
      .set('X-Request-Id', 'req_bad_json')
      .type('json')
      .send('{"count":"private-body-secret"')
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.requestId).toBe('req_bad_json');
    expect(response.text).not.toContain('private-body-secret');
  });

  it('rejects oversized bodies with a safe 413 envelope', async () => {
    const response = await request(app.getHttpServer())
      .post(`${base}/count`)
      .send({ count: 3, large: 'x'.repeat(102401) })
      .expect(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('denies anonymous private requests and uses only the trusted test resolver', async () => {
    await request(app.getHttpServer())
      .get(`${base}/private`)
      .set('X-User-Id', 'client-forged')
      .expect(401);
    const response = await request(app.getHttpServer())
      .get(`${base}/private`)
      .set('Authorization', 'Bearer test-identity')
      .expect(200);
    expect(response.body.data.userId).toBe('test-user');
  });

  it('denies other workspaces with 404 and applies membership roles', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${otherWorkspaceId}/foundation-fixture`)
      .set('Authorization', 'Bearer test-identity')
      .expect(404);
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/foundation-fixture/admin`)
      .set('Authorization', 'Bearer test-identity')
      .expect(403);
    role = WorkspaceRole.ADMIN;
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${workspaceId}/foundation-fixture/admin`)
      .set('Authorization', 'Bearer test-identity')
      .expect(200);
  });

  it('applies the configured rate limit and leaves health probes available', async () => {
    for (let index = 0; index < 3; index++)
      await request(app.getHttpServer()).get(`${base}/throttled`).expect(200);
    const response = await request(app.getHttpServer())
      .get(`${base}/throttled`)
      .expect(429);
    expect(response.body.error.code).toBe('RATE_LIMITED');
    await request(app.getHttpServer()).get('/health').expect(200);
  });

  it('exposes request IDs to the allowlisted browser origin', async () => {
    const allowed = await request(app.getHttpServer())
      .get('/api/v1')
      .set('Origin', 'http://localhost:3000')
      .expect(200);
    expect(allowed.headers['access-control-allow-origin']).toBe(
      'http://localhost:3000',
    );
    expect(allowed.headers['access-control-expose-headers']).toContain(
      'X-Request-Id',
    );
    const denied = await request(app.getHttpServer())
      .get('/api/v1')
      .set('Origin', 'https://untrusted.example')
      .expect(200);
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
    expect(allowed.headers['x-content-type-options']).toBe('nosniff');
  });

  it('documents the envelopes, probe paths and grouped error examples in OpenAPI', async () => {
    const response = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    const paths = response.body.paths;
    expect(paths['/health']).toBeDefined();
    expect(paths['/ready']).toBeDefined();
    expect(paths['/api/v1/health']).toBeUndefined();
    const list =
      paths[`${base}/list`].get.responses['200'].content['application/json']
        .schema;
    expect(list.required).toEqual(['data', 'meta', 'requestId']);
    expect(list.properties.data.type).toBe('array');
    expect(
      paths[`${base}/count`].post.responses['400'].content['application/json']
        .examples.VALIDATION_ERROR,
    ).toBeDefined();
  });
});

describe('starter safety defaults', () => {
  it('rejects bearer tokens until the real resolver is installed and disables production Swagger', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [FoundationFixtureController],
    })
      .overrideProvider(PrismaService)
      .useValue({
        onModuleInit: vi.fn(),
        onModuleDestroy: vi.fn(),
        $queryRaw: vi.fn().mockResolvedValue([1]),
      })
      .compile();
    module.get(ConfigService).set('NODE_ENV', 'production');
    const app = module.createNestApplication<NestExpressApplication>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    try {
      await request(app.getHttpServer())
        .get('/api/v1/foundation-fixture/private')
        .set('Authorization', 'Bearer arbitrary-token')
        .expect(401);
      await request(app.getHttpServer()).get('/docs').expect(404);
      await request(app.getHttpServer()).get('/docs-json').expect(404);
      await request(app.getHttpServer()).get('/health').expect(200);
    } finally {
      await app.close();
    }
  });
});
