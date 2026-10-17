import { createTestDatabase, createActorFixture } from './helpers.js';
import { goldenFixture } from './golden-fixture.js';
import { AnalyticsService } from '../../src/modules/analytics/analytics.service.js';
import { AuditService } from '../../src/modules/audit/audit.service.js';
import { PaginationQueryDto } from '../../src/common/dto/pagination-query.dto.js';
import { QueueAdminService } from '../../src/modules/queue/queue-admin.service.js';
const db = createTestDatabase();
afterAll(() => db.close());
it('derives metrics and bounded audit history only from the requested authorized workspace', async () => {
  const f = await goldenFixture(db.prisma),
    foreign = await createActorFixture(db.prisma),
    analytics = new AnalyticsService(f.uow),
    audit = new AuditService(f.uow);
  expect(await analytics.overview(f.actor, {})).toMatchObject({
    tickets: 1,
    resolved: 0,
    aiAssisted: 1,
  });
  expect(await analytics.overview(foreign, {})).toMatchObject({
    tickets: 0,
    resolved: 0,
    aiAssisted: 0,
  });
  const history = await audit.ticket(
    f.actor,
    f.ticket.id,
    new PaginationQueryDto(),
  );
  expect(history.data.some((e) => e.eventType === 'proposal.ready')).toBe(true);
  await expect(
    audit.ticket(foreign, f.ticket.id, new PaginationQueryDto()),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
});
it('recovers an exhausted durable intent only for a current administrator', async () => {
  const f = await goldenFixture(db.prisma),
    jobs = new QueueAdminService(f.uow);
  const intent = await db.prisma.outboxEvent.create({
    data: {
      workspaceId: f.actor.workspaceId,
      type: 'job.investigation',
      aggregateId: f.runId,
      payload: { requestId: f.actor.requestId },
      status: 'FAILED',
      attempts: 5,
    },
  });
  expect(
    await jobs.retry(f.actor, intent.id, { expectedAttempts: 5 }),
  ).toMatchObject({ id: intent.id, status: 'PENDING', attempts: 0 });
  await expect(
    jobs.retry(f.actor, intent.id, { expectedAttempts: 5 }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
});
