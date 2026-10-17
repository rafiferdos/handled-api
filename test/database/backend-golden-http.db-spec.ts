import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createActorFixture, createTestDatabase } from './helpers.js';
import { createTestApplication } from './http.js';
import { goldenFixture, deliverJob } from './golden-fixture.js';
import { OutboxDispatcher } from '../../src/modules/queue/outbox-dispatcher.js';
const db = createTestDatabase();
afterAll(() => db.close());
it.each(['refund', 'cancel', 'restore'] as const)(
  'proves a fresh public ticket through authenticated %s decision and persisted simulated result',
  async (kind) => {
    const f = await goldenFixture(db.prisma, kind),
      http = await createTestApplication(db.prisma, f.provider);
    try {
      const server = http.app.getHttpServer(),
        prefix = `/api/v1/workspaces/${f.actor.workspaceId}`,
        auth = `Bearer ${await http.sign(f.actor)}`;
      const ws = await db.prisma.workspace.findUniqueOrThrow({
        where: { id: f.actor.workspaceId },
      });
      const token = await request(server)
        .post(`${prefix}/support-form/token`)
        .set('Authorization', auth)
        .send({})
        .expect(201);
      const fresh = await request(server)
        .post(`/api/v1/public/workspaces/${ws.slug}/tickets`)
        .set('Origin', 'https://support.example.invalid')
        .set('X-Support-Form-Token', token.body.data.token)
        .set('Idempotency-Key', randomUUID())
        .send({
          subject: `Fresh ${kind} issue`,
          body: 'Please inspect the account evidence.',
          requesterEmail: 'synthetic@example.invalid',
          requesterCustomerRef: 'CUS-1',
        })
        .expect(201);
      const ticketId = fresh.body.data.id;
      await request(server)
        .post(`${prefix}/tickets/${ticketId}/investigations`)
        .set('Authorization', auth)
        .send({})
        .expect(422);
      await request(server)
        .post(`${prefix}/tickets/${ticketId}/verify-customer`)
        .set('Authorization', auth)
        .send({
          expectedVersion: 1,
          customerId: f.customer.id,
          verificationReason:
            'Synthetic golden-flow authenticated ownership attestation',
        })
        .expect(200);
      f.provider.toolBatches = [
        [
          {
            name: 'getCustomerProfile',
            arguments: { customerId: f.customer.id },
          },
          {
            name: 'listCustomerPayments',
            arguments: { customerId: f.customer.id },
          },
          {
            name: 'getActiveSubscription',
            arguments: { customerId: f.customer.id },
          },
          {
            name: 'getProductAccess',
            arguments: { customerId: f.customer.id },
          },
        ],
        [{ name: 'searchKnowledge', arguments: { query: 'policy', topK: 5 } }],
        [],
      ];
      const queued = await request(server)
        .post(`${prefix}/tickets/${ticketId}/investigations`)
        .set('Authorization', auth)
        .send({})
        .expect(202);
      const dispatcher = http.app.get(OutboxDispatcher);
      await deliverJob(
        db.prisma,
        dispatcher,
        f.actor.workspaceId,
        'job.investigation',
      );
      const detail = await request(server)
        .get(`${prefix}/investigations/${queued.body.data.investigationId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(detail.body.data.status).toBe('COMPLETED');
      const proposalId = detail.body.data.proposal.id;
      const key = randomUUID();
      const approval = await request(server)
        .post(`${prefix}/proposals/${proposalId}/approve`)
        .set('Authorization', auth)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 1 })
        .expect(202);
      await request(server)
        .post(`${prefix}/proposals/${proposalId}/approve`)
        .set('Authorization', auth)
        .set('Idempotency-Key', key)
        .send({ expectedVersion: 1 })
        .expect(202);
      await deliverJob(
        db.prisma,
        dispatcher,
        f.actor.workspaceId,
        'job.action',
      );
      const action = await request(server)
        .get(`${prefix}/actions/${approval.body.data.actionExecutionId}`)
        .set('Authorization', auth)
        .expect(200);
      expect(action.body.data).toMatchObject({
        status: 'SUCCEEDED',
        attempts: 1,
        simulation: true,
      });
      const audit = await request(server)
        .get(`${prefix}/tickets/${ticketId}/audit`)
        .set('Authorization', auth)
        .expect(200);
      expect(
        audit.body.data.some(
          (event: { eventType: string }) =>
            event.eventType === 'action.completed',
        ),
      ).toBe(true);
      const foreign = await createActorFixture(db.prisma);
      await request(server)
        .get(
          `/api/v1/workspaces/${foreign.workspaceId}/actions/${approval.body.data.actionExecutionId}`,
        )
        .set('Authorization', `Bearer ${await http.sign(foreign)}`)
        .expect(404);
    } finally {
      await http.close();
    }
  },
);
