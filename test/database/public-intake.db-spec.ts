import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createActorFixture, createTestDatabase } from './helpers.js';
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
it('persists one safe receipt across retries and concurrent calls without trusting customer hints', async () => {
  const actor = await createActorFixture(db.prisma);
  const auth = `Bearer ${await http.sign(actor)}`;
  const server = http.app.getHttpServer();
  const ws = await db.prisma.workspace.findUniqueOrThrow({
    where: { id: actor.workspaceId },
  });
  const issued = await request(server)
    .post(`/api/v1/workspaces/${actor.workspaceId}/support-form/token`)
    .set('Authorization', auth)
    .send({})
    .expect(201);
  const token = issued.body.data.token as string;
  const path = `/api/v1/public/workspaces/${ws.slug}/tickets`;
  const payload = {
    subject: 'Help',
    body: 'Duplicate payment',
    requesterEmail: 'victim@example.invalid',
    requesterCustomerRef: 'CUS-1',
  };
  const send = (key: string, body: object = payload) =>
    request(server)
      .post(path)
      .set('Origin', 'https://support.example.invalid')
      .set('X-Support-Form-Token', token)
      .set('Idempotency-Key', key)
      .send(body);
  const results = await Promise.all([
    send('public-request-1'),
    send('public-request-1'),
    send('public-request-1'),
  ]);
  for (const r of results) {
    expect(r.status).toBe(201);
    expect(Object.keys(r.body.data).sort()).toEqual([
      'id',
      'reference',
      'status',
    ]);
  }
  expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
  const ticket = await db.prisma.ticket.findUniqueOrThrow({
    where: { id: results[0].body.data.id as string },
  });
  expect(ticket.customerId).toBeNull();
  expect(ticket.customerVerifiedAt).toBeNull();
  expect(
    await db.prisma.ticketMessage.count({
      where: { workspaceId: actor.workspaceId },
    }),
  ).toBe(1);
  expect(
    (await send('public-request-1', { ...payload, body: 'Changed' })).status,
  ).toBe(409);
  expect(
    (await send('unknown-field', { ...payload, customerId: randomUUID() }))
      .status,
  ).toBe(400);
  await request(server)
    .post(path)
    .set('Origin', 'https://evil.invalid')
    .set('X-Support-Form-Token', token)
    .set('Idempotency-Key', 'origin-denied')
    .send(payload)
    .expect(403);
  await request(server)
    .post(path)
    .set('Origin', 'https://support.example.invalid')
    .set('X-Support-Form-Token', 'wrong')
    .set('Idempotency-Key', 'bad-token')
    .send(payload)
    .expect(403);
  for (let i = 2; i <= 5; i++)
    expect((await send(`public-request-${i}`)).status).toBe(201);
  expect((await send('public-request-6')).status).toBe(429);
  expect((await send('public-request-1')).status).toBe(201);
  await db.prisma.workspace.update({
    where: { id: actor.workspaceId },
    data: { supportFormTokenExpiresAt: new Date(Date.now() - 1000) },
  });
  expect((await send('public-request-1')).status).toBe(403);
  await db.prisma.workspace.update({
    where: { id: actor.workspaceId },
    data: { status: 'SUSPENDED' },
  });
  expect((await send('public-request-1')).status).toBe(404);
});
