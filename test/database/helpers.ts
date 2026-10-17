import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type { PoolClient } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { testDatabaseUrl } from './database-url.js';

export function createTestDatabase() {
  const connectionString = testDatabaseUrl(process.env.TEST_DATABASE_URL);
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString, max: 5 }),
  });
  return { prisma, close: () => prisma.$disconnect() };
}

export async function inSqlTransaction(
  work: (client: Client) => Promise<void>,
): Promise<void> {
  const client = new Client({
    connectionString: testDatabaseUrl(process.env.TEST_DATABASE_URL),
  });
  await client.connect();
  try {
    const result = await client.query<{ name: string }>(
      'SELECT current_database() AS name',
    );
    if (result.rows[0]?.name !== 'handled_test') {
      throw new Error('Refusing a non-test database');
    }
    await client.query('BEGIN');
    await work(client);
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
}

export async function sqlWorkspace(client: Client | PoolClient) {
  const id = randomUUID();
  await client.query(
    'INSERT INTO handled."Workspace" (id, slug, name, "updatedAt") VALUES ($1, $2, $3, now())',
    [id, `ws-${id}`, 'Fixture workspace'],
  );
  return id;
}

export async function sqlLeadFixture(client: Client) {
  const workspaceId = await sqlWorkspace(client);
  const userId = randomUUID();
  const membershipId = randomUUID();
  const customerId = randomUUID();
  const ticketId = randomUUID();
  const otherTicketId = randomUUID();
  const runId = randomUUID();
  const proposalId = randomUUID();
  await client.query(
    'INSERT INTO handled."Profile" (id,email,"updatedAt") VALUES ($1,$2,now())',
    [userId, `${userId}@example.invalid`],
  );
  await client.query(
    'INSERT INTO handled."Membership" (id,"workspaceId","userId",role,"updatedAt") VALUES ($1,$2,$3,\'ADMIN\',now())',
    [membershipId, workspaceId, userId],
  );
  await client.query(
    'INSERT INTO handled."Customer" (id,"workspaceId","externalRef",name,email,"updatedAt") VALUES ($1,$2,\'CUS-1\',\'Maya\',\'maya@example.invalid\',now())',
    [customerId, workspaceId],
  );
  for (const [id, reference] of [
    [ticketId, 'TKT-1'],
    [otherTicketId, 'TKT-2'],
  ]) {
    await client.query(
      'INSERT INTO handled."Ticket" (id,"workspaceId",reference,subject,"updatedAt") VALUES ($1,$2,$3,\'Issue\',now())',
      [id, workspaceId, reference],
    );
  }
  await client.query(
    'INSERT INTO handled."InvestigationRun" (id,"workspaceId","ticketId",provider,model,"promptVersion","triggeredByUserId","triggeredByMembershipId","triggeredBySessionId","requestId","updatedAt") VALUES ($1,$2,$3,\'fixture\',\'fixture\',\'v1\',$4,$5,$6,\'fixture\',now())',
    [runId, workspaceId, ticketId, userId, membershipId, randomUUID()],
  );
  await client.query(
    'INSERT INTO handled."Proposal" (id,"workspaceId","ticketId","investigationId",version,status,category,confidence,summary,"replyDraft","updatedAt") VALUES ($1,$2,$3,$4,1,\'READY\',\'OTHER\',\'LOW\',\'Manual review\',\'Please review\',now())',
    [proposalId, workspaceId, ticketId, runId],
  );
  return {
    workspaceId,
    userId,
    membershipId,
    customerId,
    ticketId,
    otherTicketId,
    runId,
    proposalId,
  };
}

/** Minimal upstream-column fixture, created only in the guarded disposable DB. */
export async function createAuthFixture(
  prisma: PrismaClient,
  userId = randomUUID(),
) {
  await prisma.$executeRawUnsafe('CREATE SCHEMA IF NOT EXISTS auth');
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, deleted_at timestamptz, banned_until timestamptz)',
  );
  await prisma.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS auth.sessions (id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id), not_after timestamptz)',
  );
  const sessionId = randomUUID();
  const email = `${userId}@example.invalid`;
  await prisma.$executeRaw`INSERT INTO auth.users (id,email,email_confirmed_at) VALUES (${userId}::uuid,${email},now()) ON CONFLICT (id) DO NOTHING`;
  await prisma.$executeRaw`INSERT INTO auth.sessions (id,user_id) VALUES (${sessionId}::uuid,${userId}::uuid)`;
  return {
    userId,
    sessionId,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    email,
  };
}

export async function createActorFixture(prisma: PrismaClient) {
  const identity = await createAuthFixture(prisma);
  const workspaceId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.profile.create({
      data: { id: identity.userId, email: identity.email },
    });
    await tx.workspace.create({
      data: { id: workspaceId, name: 'Fixture', slug: `ws-${workspaceId}` },
    });
    await tx.membership.create({
      data: { workspaceId, userId: identity.userId, role: 'ADMIN' },
    });
  });
  return { ...identity, workspaceId, requestId: randomUUID() };
}
