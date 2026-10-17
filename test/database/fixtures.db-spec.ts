import { randomUUID } from 'node:crypto';
import { createAuthFixture, createTestDatabase } from './helpers.js';
import { seedFixtures } from '../../prisma/seed-data.js';
const db = createTestDatabase();
afterAll(() => db.close());
it('seeds canonical cases repeatedly without resetting changed records or unrelated tenants', async () => {
  const admin = await createAuthFixture(db.prisma),
    agent = await createAuthFixture(db.prisma),
    viewer = await createAuthFixture(db.prisma);
  const pixelAdmin = await createAuthFixture(db.prisma);
  const input = {
    pixelAdminUserId: pixelAdmin.userId,
    workspaceId: randomUUID(),
    pixelWorkspaceId: randomUUID(),
    adminUserId: admin.userId,
    agentUserId: agent.userId,
    viewerUserId: viewer.userId,
  };
  await db.prisma
    .$executeRaw`UPDATE auth.users SET email=upper(email) WHERE id=${admin.userId}::uuid`;
  const first = await seedFixtures(db.prisma, input);
  expect(
    await db.prisma.knowledgeDocument.count({
      where: { workspaceId: input.workspaceId, status: 'DRAFT' },
    }),
  ).toBe(3);
  expect(
    await db.prisma.ticket.count({ where: { workspaceId: input.workspaceId } }),
  ).toBe(3);
  expect(
    await db.prisma.payment.findMany({
      where: { workspaceId: input.workspaceId },
      select: { externalRef: true, amountMinor: true, currency: true },
      orderBy: { externalRef: 'asc' },
    }),
  ).toEqual([
    { externalRef: 'PAY-9001', amountMinor: 2900, currency: 'USD' },
    { externalRef: 'PAY-9002', amountMinor: 2900, currency: 'USD' },
    { externalRef: 'PAY-9003', amountMinor: 1900, currency: 'USD' },
  ]);
  const subscription = await db.prisma.subscription.findFirstOrThrow({
    where: { workspaceId: input.workspaceId, externalRef: 'SUB-1002' },
  });
  await db.prisma.subscription.update({
    where: { id: subscription.id },
    data: { cancelAtPeriodEnd: true },
  });
  await db.prisma.workspace.update({
    where: { id: input.workspaceId },
    data: { ticketSequence: 1010 },
  });
  const again = await seedFixtures(db.prisma, input);
  expect(first).toEqual(again);
  expect(
    await db.prisma.ticket.count({ where: { workspaceId: input.workspaceId } }),
  ).toBe(3);
  expect(
    (
      await db.prisma.workspace.findUniqueOrThrow({
        where: { id: input.workspaceId },
      })
    ).ticketSequence,
  ).toBe(1010);
  expect(
    (
      await db.prisma.subscription.findUniqueOrThrow({
        where: { id: subscription.id },
      })
    ).cancelAtPeriodEnd,
  ).toBe(true);
  expect(
    await db.prisma.customer.count({
      where: { workspaceId: input.pixelWorkspaceId },
    }),
  ).toBe(1);
  expect(
    await db.prisma.membership.count({
      where: { workspaceId: input.pixelWorkspaceId },
    }),
  ).toBe(1);
  expect(
    await db.prisma.membership.count({
      where: { workspaceId: input.pixelWorkspaceId, userId: admin.userId },
    }),
  ).toBe(0);
  expect(
    await db.prisma.ticket.count({
      where: { workspaceId: input.pixelWorkspaceId },
    }),
  ).toBe(1);
  await expect(
    seedFixtures(db.prisma, { ...input, pixelWorkspaceId: input.workspaceId }),
  ).rejects.toThrow();
});
