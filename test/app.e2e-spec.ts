import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { QueueHealthIndicator } from '../src/modules/queue/queue.health.js';
import { configureApp } from '../src/config/configure-app.js';

describe('AppController (e2e)', () => {
  let app: NestExpressApplication;
  const database = {
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
    $queryRaw: vi.fn(),
  };

  const queueHealth = {
    ready: vi.fn(async () => ({ redis: 'connected' as const })),
  };

  beforeEach(async () => {
    database.$queryRaw.mockReset();
    database.$queryRaw.mockResolvedValue([{ connected: 1 }]);
    queueHealth.ready.mockReset();
    queueHealth.ready.mockResolvedValue({ redis: 'connected' });
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database)
      .overrideProvider(QueueHealthIndicator)
      .useValue(queueHealth)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication>();
    configureApp(app);
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toEqual({
          name: 'Handled API',
          apiVersion: 'v1',
          status: 'starter',
        });
        expect(response.body.requestId).toBe(response.headers['x-request-id']);
      });
  });

  it('reports readiness when the database and Redis probes succeed', () => {
    return request(app.getHttpServer())
      .get('/ready')
      .expect(200)
      .expect({ status: 'ok', database: 'connected', redis: 'connected' });
  });

  it('returns 503 without leaking database errors when the database fails', async () => {
    database.$queryRaw.mockRejectedValueOnce(
      new Error('connection failed: private-database-password'),
    );

    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(503);

    expect(response.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
    expect(response.text).not.toContain('private-database-password');
  });

  it('returns 503 when the Redis probe reports an outage', async () => {
    const { AppException } =
      await import('../src/common/errors/app.exception.js');
    const { ErrorCode } = await import('../src/common/errors/error-codes.js');
    queueHealth.ready.mockRejectedValueOnce(
      new AppException(ErrorCode.DEPENDENCY_UNAVAILABLE),
    );

    const response = await request(app.getHttpServer())
      .get('/ready')
      .expect(503);

    expect(response.body.error.code).toBe('DEPENDENCY_UNAVAILABLE');
  });

  afterEach(async () => {
    await app.close();
  });
});
