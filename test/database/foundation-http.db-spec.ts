import { randomUUID } from 'node:crypto';
import request from 'supertest';
import {
  createActorFixture,
  createAuthFixture,
  createTestDatabase,
} from './helpers.js';
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
it('rejects malformed slugs at the HTTP boundary with a validation error', async () => {
  const f = await createActorFixture(db.prisma);
  const r = await request(http.app.getHttpServer())
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${await http.sign(f)}`)
    .send({ name: 'Invalid slug', slug: 'bad--slug' });
  expect(r.status).toBe(400);
  expect(r.body.error.code).toBe('VALIDATION_ERROR');
});
it('enforces the real ADMIN/AGENT/VIEWER matrix for items, counts, mutations and invites', async () => {
  const admin = await createActorFixture(db.prisma);
  const agent = await createAuthFixture(db.prisma),
    viewer = await createAuthFixture(db.prisma);
  for (const [f, role] of [
    [agent, 'AGENT'],
    [viewer, 'VIEWER'],
  ] as const) {
    await db.prisma.profile.create({ data: { id: f.userId, email: f.email } });
    await db.prisma.membership.create({
      data: { workspaceId: admin.workspaceId, userId: f.userId, role },
    });
  }
  const prefix = `/api/v1/workspaces/${admin.workspaceId}`;
  const server = http.app.getHttpServer();
  for (const [f, writeStatus, inviteStatus] of [
    [admin, 201, 200],
    [agent, 201, 403],
    [viewer, 403, 403],
  ] as const) {
    const auth = `Bearer ${await http.sign(f)}`;
    const list = await request(server)
      .get(`${prefix}/customers`)
      .set('Authorization', auth)
      .expect(200);
    expect(list.body.meta.total).toBe(
      f === admin ? 0 : 1 + (f === viewer ? 1 : 0),
    );
    await request(server)
      .post(`${prefix}/customers`)
      .set('Authorization', auth)
      .send({
        externalRef: randomUUID(),
        name: 'Scope test',
        email: 'scope@example.invalid',
      })
      .expect(writeStatus);
    await request(server)
      .get(`${prefix}/invites`)
      .set('Authorization', auth)
      .expect(inviteStatus);
  }
  const foreign = await createActorFixture(db.prisma);
  const auth = `Bearer ${await http.sign(foreign)}`;
  await request(server)
    .get(`${prefix}/customers`)
    .set('Authorization', auth)
    .expect(404);
  await request(server)
    .get(`${prefix}/tickets/${randomUUID()}`)
    .set('Authorization', auth)
    .expect(404);
});
it('validates messages, active assignments and customer attestations through the actual HTTP pipeline', async () => {
  const actor = await createActorFixture(db.prisma),
    auth = `Bearer ${await http.sign(actor)}`;
  const server = http.app.getHttpServer();
  const prefix = `/api/v1/workspaces/${actor.workspaceId}`;
  const created = await request(server)
    .post(`${prefix}/tickets`)
    .set('Authorization', auth)
    .set('Idempotency-Key', randomUUID())
    .send({ subject: 'Access', body: 'Need help' })
    .expect(201);
  const path = `${prefix}/tickets/${created.body.data.id as string}`;
  for (const body of [null, '', 'x'.repeat(10001)])
    await request(server)
      .post(`${path}/messages`)
      .set('Authorization', auth)
      .send({ body })
      .expect(400);
  await request(server)
    .patch(`${path}/status`)
    .set('Authorization', auth)
    .send({ expectedVersion: 1, status: 'EXECUTING' })
    .expect(409);
  const member = await db.prisma.membership.findUniqueOrThrow({
    where: {
      workspaceId_userId: {
        workspaceId: actor.workspaceId,
        userId: actor.userId,
      },
    },
  });
  await request(server)
    .patch(`${path}/assignee`)
    .set('Authorization', auth)
    .send({ expectedVersion: 1, assigneeId: member.id })
    .expect(200);
  await request(server)
    .patch(`${path}/assignee`)
    .set('Authorization', auth)
    .send({ expectedVersion: 2, assigneeId: null })
    .expect(200);
  const customer = await request(server)
    .post(`${prefix}/customers`)
    .set('Authorization', auth)
    .send({
      externalRef: 'CUS-http',
      name: 'Account',
      email: 'account@example.invalid',
    })
    .expect(201);
  await request(server)
    .post(`${path}/verify-customer`)
    .set('Authorization', auth)
    .send({
      expectedVersion: 3,
      customerId: customer.body.data.id,
      verificationReason: 'Trusted synthetic account check',
      actorUserId: randomUUID(),
    })
    .expect(400);
  await request(server)
    .post(`${path}/verify-customer`)
    .set('Authorization', auth)
    .send({
      expectedVersion: 3,
      customerId: customer.body.data.id,
      verificationReason: 'Trusted synthetic account check',
    })
    .expect(200);
  const context = await request(server)
    .get(
      `${prefix}/customers/${customer.body.data.id as string}/account-context`,
    )
    .set('Authorization', auth)
    .expect(200);
  expect(context.body.data).toMatchObject({
    payments: [],
    subscriptions: [],
    productAccess: [],
    counts: { payments: 0, subscriptions: 0, productAccess: 0 },
    limit: 50,
  });
  await db.prisma
    .$executeRaw`DELETE FROM auth.sessions WHERE id=${actor.sessionId}::uuid`;
  await request(server).get(path).set('Authorization', auth).expect(401);
});
it('documents core response envelopes and nullable scalar fields in OpenAPI', async () => {
  const r = await request(http.app.getHttpServer())
    .get('/docs-json')
    .expect(200);
  expect(
    r.body.paths['/api/v1/me'].put.responses['200'].content['application/json']
      .schema.properties,
  ).toHaveProperty('requestId');
  expect(
    r.body.components.schemas.ProfileResponseDto.properties.displayName,
  ).toMatchObject({ type: 'string', nullable: true });
  expect(
    r.body.paths[
      '/api/v1/workspaces/{workspaceId}/customers/{customerId}/account-context'
    ].get.responses['200'].content['application/json'].schema.properties.data
      .$ref,
  ).toContain('AccountContextResponseDto');
});

it('correlates workspace creation audit with the actual request ID', async () => {
  const f = await createActorFixture(db.prisma);
  const requestId = randomUUID();
  const created = await request(http.app.getHttpServer())
    .post('/api/v1/workspaces')
    .set('Authorization', `Bearer ${await http.sign(f)}`)
    .set('X-Request-Id', requestId)
    .send({
      name: 'Audit correlation',
      slug: `audit-${randomUUID().slice(0, 8)}`,
    })
    .expect(201);
  const audit = await db.prisma.auditEvent.findFirstOrThrow({
    where: { workspaceId: created.body.data.id as string },
  });
  expect(audit.requestId).toBe(requestId);
});
