import request from 'supertest';
import { createAuthFixture, createTestDatabase } from './helpers.js';
import { createTestApplication } from './http.js';
const db = createTestDatabase();
let http: Awaited<ReturnType<typeof createTestApplication>>;
beforeAll(async () => {
  http = await createTestApplication(db.prisma);
});
afterAll(async () => {
  await http.close();
  await db.close();
});
it('uses actual signed auth, strict bodies and correlated envelopes on profile/workspace routes', async () => {
  const identity = await createAuthFixture(db.prisma);
  const auth = `Bearer ${await http.sign(identity)}`;
  const server = http.app.getHttpServer();
  await request(server)
    .put('/api/v1/me')
    .set('Authorization', auth)
    .send({
      displayName: 'Lead',
      email: 'spoof@example.invalid',
      role: 'ADMIN',
    })
    .expect(400);
  await request(server)
    .put('/api/v1/me')
    .set('Authorization', auth)
    .send({ displayName: null })
    .expect(400);
  const profile = await request(server)
    .put('/api/v1/me')
    .set('Authorization', auth)
    .send({ displayName: 'Lead' })
    .expect(200);
  expect(profile.body.data.email).toBe(identity.email);
  const result = await request(server)
    .post('/api/v1/workspaces')
    .set('Authorization', auth)
    .send({ name: 'Acme', slug: `http-${identity.userId.slice(0, 8)}` })
    .expect(201);
  expect(result.body.requestId).toBe(result.headers['x-request-id']);
  const id = result.body.data.id as string;
  await request(server)
    .get(`/api/v1/workspaces/${id.toUpperCase()}`)
    .set('Authorization', auth)
    .expect(200);
  await request(server)
    .patch(`/api/v1/workspaces/${id}`)
    .set('Authorization', auth)
    .send({ name: null, expectedVersion: 1 })
    .expect(400);
  await request(server)
    .get('/api/v1/workspaces?page=2147483649&limit=20')
    .set('Authorization', auth)
    .expect(400);
  await request(server).get(`/api/v1/workspaces/${id}`).expect(401);
});
