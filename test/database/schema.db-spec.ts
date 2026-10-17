import { randomUUID } from 'node:crypto';
import { inSqlTransaction, sqlLeadFixture, sqlWorkspace } from './helpers.js';

describe('foundation schema', () => {
  it('persists a real workspace in the private application schema', async () => {
    await inSqlTransaction(async (client) => {
      const id = await sqlWorkspace(client);
      const result = await client.query<{ name: string; status: string }>(
        'SELECT name, status FROM handled."Workspace" WHERE id = $1',
        [id],
      );
      expect(result.rows).toEqual([
        { name: 'Fixture workspace', status: 'ACTIVE' },
      ]);
    });
  });

  it('rejects a customer FK into another workspace', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      const foreignWorkspace = await sqlWorkspace(client);
      await expect(
        client.query(
          'INSERT INTO handled."Ticket" (id,"workspaceId",reference,subject,"customerId","updatedAt") VALUES ($1,$2,\'TKT-X\',\'foreign\',$3,now())',
          [randomUUID(), foreignWorkspace, f.customerId],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects a payment linked to another customer subscription in the same tenant', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      const secondCustomer = randomUUID();
      const subscription = randomUUID();
      await client.query(
        'INSERT INTO handled."Customer" (id,"workspaceId","externalRef",name,email,"updatedAt") VALUES ($1,$2,\'CUS-2\',\'Other\',\'other@example.invalid\',now())',
        [secondCustomer, f.workspaceId],
      );
      await client.query(
        'INSERT INTO handled."Subscription" (id,"workspaceId","customerId","externalRef","planCode","productCode","currentPeriodStart","currentPeriodEnd","updatedAt") VALUES ($1,$2,$3,\'SUB-1\',\'PRO\',\'app-main\',now(),now()+interval \'1 month\',now())',
        [subscription, f.workspaceId, secondCustomer],
      );
      await expect(
        client.query(
          'INSERT INTO handled."Payment" (id,"workspaceId","customerId","subscriptionId","externalRef","billingPeriodKey","amountMinor",currency,"updatedAt") VALUES ($1,$2,$3,$4,\'PAY-1\',\'2026-10\',2900,\'USD\',now())',
          [randomUUID(), f.workspaceId, f.customerId, subscription],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('allows an unassociated payment without weakening customer scope', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      const result = await client.query(
        'INSERT INTO handled."Payment" (id,"workspaceId","customerId","externalRef","billingPeriodKey","amountMinor",currency,"updatedAt") VALUES ($1,$2,$3,\'PAY-1\',\'2026-10\',2900,\'USD\',now())',
        [randomUUID(), f.workspaceId, f.customerId],
      );
      expect(result.rowCount).toBe(1);
    });
  });

  it.each([
    [-1, 'USD'],
    [2900, 'usd'],
  ])(
    'rejects invalid money values %s/%s at the DB boundary',
    async (amount, currency) => {
      await inSqlTransaction(async (client) => {
        const f = await sqlLeadFixture(client);
        await expect(
          client.query(
            'INSERT INTO handled."Payment" (id,"workspaceId","customerId","externalRef","billingPeriodKey","amountMinor",currency,"updatedAt") VALUES ($1,$2,$3,\'PAY-X\',\'2026-10\',$4,$5,now())',
            [randomUUID(), f.workspaceId, f.customerId, amount, currency],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      });
    },
  );

  it('rejects a proposal using another ticket run within the same workspace', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      await expect(
        client.query(
          'INSERT INTO handled."Proposal" (id,"workspaceId","ticketId","investigationId",version,status,category,confidence,summary,"replyDraft","updatedAt") VALUES ($1,$2,$3,$4,2,\'SUPERSEDED\',\'OTHER\',\'LOW\',\'Manual\',\'Draft\',now())',
          [randomUUID(), f.workspaceId, f.otherTicketId, f.runId],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('rejects a decision naming a version different from its exact stored proposal', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      await expect(
        client.query(
          'INSERT INTO handled."ProposalDecision" (id,"workspaceId","proposalId","proposalVersion",kind,"actorUserId","actorMembershipId","actorSessionId","requestId",reason) VALUES ($1,$2,$3,9,\'REJECTED\',$4,$5,$6,\'fixture\',\'Version mismatch test\')',
          [
            randomUUID(),
            f.workspaceId,
            f.proposalId,
            f.userId,
            f.membershipId,
            randomUUID(),
          ],
        ),
      ).rejects.toMatchObject({ code: '23503' });
    });
  });

  it('admits only one active run per tenant ticket even without an application pre-check', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      await expect(
        client.query(
          'INSERT INTO handled."InvestigationRun" (id,"workspaceId","ticketId",provider,model,"promptVersion","triggeredByUserId","triggeredByMembershipId","triggeredBySessionId","requestId","updatedAt") VALUES ($1,$2,$3,\'fixture\',\'fixture\',\'v1\',$4,$5,$6,\'fixture\',now())',
          [
            randomUUID(),
            f.workspaceId,
            f.ticketId,
            f.userId,
            f.membershipId,
            randomUUID(),
          ],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  it('retains immutable proposal content and history', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      await expect(
        client.query(
          'UPDATE handled."Proposal" SET summary=\'Rewritten\' WHERE id=$1',
          [f.proposalId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('prevents history removal by deleting a referenced parent', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      await expect(
        client.query('DELETE FROM handled."Ticket" WHERE id=$1', [f.ticketId]),
      ).rejects.toMatchObject({ code: '23001' });
    });
  });

  it('denies direct reads to an API role even after an accidental table grant', async () => {
    await inSqlTransaction(async (client) => {
      await sqlLeadFixture(client);
      await client.query('GRANT USAGE ON SCHEMA handled TO anon');
      await client.query('GRANT SELECT ON handled."Customer" TO anon');
      await client.query('SET LOCAL ROLE anon');
      const result = await client.query<{ count: string }>(
        'SELECT count(*) FROM handled."Customer"',
      );
      expect(result.rows[0]?.count).toBe('0');
    });
  });

  it('requires a real tool name instead of accepting SQL unknown in a CHECK', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      await expect(
        client.query(
          'INSERT INTO handled."InvestigationStep" (id,"workspaceId","investigationId",sequence,type,label,status,"updatedAt") VALUES ($1,$2,$3,1,\'TOOL\',\'Read account\',\'RUNNING\',now())',
          [randomUUID(), f.workspaceId, f.runId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('requires a non-null KB revision as well as its document and chunk IDs', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      await expect(
        client.query(
          'INSERT INTO handled."ProposalSource" (id,"workspaceId","proposalId","sourceType","sourceRefId",title,excerpt,"contentHash","observedAt","documentId","chunkId") VALUES ($1,$2,$3,\'KNOWLEDGE\',\'KB-v1\',\'Policy\',\'Evidence\',$4,now(),$5,$6)',
          [
            randomUUID(),
            f.workspaceId,
            f.proposalId,
            'a'.repeat(64),
            randomUUID(),
            randomUUID(),
          ],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  it('cannot persist a recommendation type without its payload', async () => {
    await inSqlTransaction(async (client) => {
      const f = await sqlLeadFixture(client);
      await expect(
        client.query(
          'INSERT INTO handled."Proposal" (id,"workspaceId","ticketId","investigationId",version,status,category,confidence,summary,"replyDraft","recommendationType","updatedAt") VALUES ($1,$2,$3,$4,2,\'SUPERSEDED\',\'OTHER\',\'LOW\',\'Manual\',\'Draft\',\'REFUND_DUPLICATE_PAYMENT\',now())',
          [randomUUID(), f.workspaceId, f.ticketId, f.runId],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });
});
