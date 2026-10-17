import { randomUUID } from 'node:crypto';
import {
  createActorFixture,
  createTestDatabase,
  inSqlTransaction,
  sqlLeadFixture,
} from './helpers.js';
const db = createTestDatabase();
afterAll(() => db.close());
it('retains immutable scoped policy revisions and rejects invalid vector dimensions', async () => {
  const actor = await createActorFixture(db.prisma);
  const documentId = randomUUID();
  await db.prisma
    .$executeRaw`INSERT INTO handled."KnowledgeDocument" (id,"workspaceId",slug,title,body,"updatedAt") VALUES (${documentId}::uuid,${actor.workspaceId}::uuid,'refund','Refund policy','Draft',now())`;
  await db.prisma
    .$executeRaw`INSERT INTO handled."KnowledgeRevision" (id,"workspaceId","documentId",version,title,body,"contentHash","policyRules") VALUES (${randomUUID()}::uuid,${actor.workspaceId}::uuid,${documentId}::uuid,1,'Refund policy','Duplicate only',${'a'.repeat(64)},'{}'::jsonb)`;
  await expect(
    db.prisma
      .$executeRaw`UPDATE handled."KnowledgeRevision" SET body='Changed' WHERE "documentId"=${documentId}::uuid`,
  ).rejects.toThrow();
  await expect(
    db.prisma
      .$executeRaw`INSERT INTO handled."KnowledgeChunk" (id,"workspaceId","documentId","documentVersion","chunkIndex",content,"contentHash","embeddingModel",embedding) VALUES (${randomUUID()}::uuid,${actor.workspaceId}::uuid,${documentId}::uuid,1,0,'Duplicate only',${'a'.repeat(64)},'fixture','[1,2,3]'::extensions.vector)`,
  ).rejects.toThrow();
  const foreign = await createActorFixture(db.prisma);
  await expect(
    db.prisma
      .$executeRaw`INSERT INTO handled."KnowledgeRevision" (id,"workspaceId","documentId",version,title,body,"contentHash","policyRules") VALUES (${randomUUID()}::uuid,${foreign.workspaceId}::uuid,${documentId}::uuid,2,'Other','Wrong tenant',${'a'.repeat(64)},'{}'::jsonb)`,
  ).rejects.toThrow();
  const rows = await db.prisma.$queryRaw<
    Array<{ relrowsecurity: boolean }>
  >`SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='handled' AND c.relname IN ('KnowledgeDocument','KnowledgeRevision','KnowledgeChunk','ActionExecution')`;
  expect(rows).toHaveLength(4);
  expect(rows.every((row) => row.relrowsecurity)).toBe(true);
});
it('binds an action to one exact decision and proposal revision', async () => {
  await inSqlTransaction(async (client) => {
    const f = await sqlLeadFixture(client);
    const decision = randomUUID(),
      action = randomUUID();
    await client.query(
      'INSERT INTO handled."ProposalDecision" (id,"workspaceId","proposalId","proposalVersion",kind,"actorUserId","actorMembershipId","actorSessionId","requestId") VALUES ($1,$2,$3,1,\'APPROVED\',$4,$5,$6,\'fixture\')',
      [
        decision,
        f.workspaceId,
        f.proposalId,
        f.userId,
        f.membershipId,
        randomUUID(),
      ],
    );
    const sql =
      'INSERT INTO handled."ActionExecution" (id,"workspaceId","ticketId","proposalId","proposalVersion","decisionId",type,"targetId","targetRef","requestId","updatedAt") VALUES ($1,$2,$3,$4,1,$5,\'CANCEL_AT_PERIOD_END\',$6,\'SUB-1\',\'fixture\',now())';
    await client.query(sql, [
      action,
      f.workspaceId,
      f.ticketId,
      f.proposalId,
      decision,
      randomUUID(),
    ]);
    await expect(
      client.query(sql, [
        randomUUID(),
        f.workspaceId,
        f.ticketId,
        f.proposalId,
        decision,
        randomUUID(),
      ]),
    ).rejects.toMatchObject({ code: '23505' });
  });
});
