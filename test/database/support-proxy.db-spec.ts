import { createHmac, randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { createActorFixture, createTestDatabase } from './helpers.js';
import { createTestApplication } from './http.js';

const db = createTestDatabase();
const secret = 'synthetic-support-proxy-secret-at-least-32-characters';
let http: Awaited<ReturnType<typeof createTestApplication>>;
beforeAll(async () => {
  http = await createTestApplication(db.prisma);
  http.app.get(ConfigService).set('SUPPORT_PROXY_SECRET', secret);
});
afterAll(async () => {
  await http.close();
  await db.close();
});

it('requires the signed proxy and rate limits each attested client separately', async () => {
  const actor = await createActorFixture(db.prisma);
  const workspace = await db.prisma.workspace.findUniqueOrThrow({
    where: { id: actor.workspaceId },
  });
  const server = http.app.getHttpServer();
  const token = await request(server)
    .post(`/api/v1/workspaces/${actor.workspaceId}/support-form/token`)
    .set('Authorization', `Bearer ${await http.sign(actor)}`)
    .send({})
    .expect(201);
  const origin = 'https://support.example.invalid';
  const path = `/api/v1/public/workspaces/${workspace.slug}/tickets`;
  const send = (ip: string | undefined, valid = true, key = randomUUID()) => {
    let req = request(server)
      .post(path)
      .set('Origin', origin)
      .set('X-Support-Form-Token', token.body.data.token)
      .set('Idempotency-Key', key);
    if (ip) {
      const timestamp = String(Math.floor(Date.now() / 1000));
      const signature = createHmac('sha256', secret)
        .update(`${timestamp}\n${workspace.slug}\n${origin}\n${ip}`)
        .digest('hex');
      req = req
        .set('X-Support-Client-IP', ip)
        .set('X-Support-Timestamp', timestamp)
        .set('X-Support-Signature', valid ? signature : 'f'.repeat(64));
    }
    return req.send({
      subject: 'Synthetic support request',
      body: 'Please inspect the controlled test account.',
      requesterEmail: 'test@example.invalid',
    });
  };
  await send(undefined).expect(403);
  await send('203.0.113.8', false).expect(403);
  const key = randomUUID();
  const first = await send('203.0.113.8', true, key).expect(201);
  const replay = await send('203.0.113.8', true, key).expect(201);
  expect(replay.body.data.id).toBe(first.body.data.id);
  for (let i = 0; i < 4; i++) await send('203.0.113.8').expect(201);
  await send('203.0.113.8').expect(429);
  await send('203.0.113.9').expect(201);
  expect(
    await db.prisma.ticket.count({ where: { workspaceId: actor.workspaceId } }),
  ).toBe(6);
});
