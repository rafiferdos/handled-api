import { Test, TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from '../src/common/database/prisma.service.js';
import { configureApp } from '../src/config/configure-app.js';

describe('AppController (e2e)', () => {
  let app: NestExpressApplication<App>;
  const database = {
    onModuleInit: vi.fn(),
    onModuleDestroy: vi.fn(),
    $queryRaw: vi.fn(),
  };

  beforeEach(async () => {
    database.$queryRaw.mockReset();
    database.$queryRaw.mockResolvedValue([{ connected: 1 }]);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(database)
      .compile();

    app = moduleFixture.createNestApplication<NestExpressApplication<App>>();
    configureApp(app);
    await app.init();
  });

  it('/api/v1 (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect((response) => {
        expect(response.body.data).toBe('Hello World!');
        expect(response.body.requestId).toBe(response.headers['x-request-id']);
      });
  });

  it('reports readiness when the database responds', () => {
    return request(app.getHttpServer())
      .get('/ready')
      .expect(200)
      .expect({ status: 'ok', database: 'connected' });
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

  afterEach(async () => {
    await app.close();
  });
});
