import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '../src/generated/prisma/client.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
const id = z.uuid().transform((v) => v.toLowerCase());
const seedInputSchema = z
  .strictObject({
    workspaceId: id,
    pixelWorkspaceId: id,
    adminUserId: id,
    agentUserId: id,
    viewerUserId: id,
    pixelAdminUserId: id,
  })
  .refine((v) => new Set(Object.values(v)).size === 6);
export type SeedInput = z.input<typeof seedInputSchema>;

/** RFC 9562 UUIDv5: fixture keys are namespaced by an explicit workspace UUID. */
export function fixtureId(workspaceId: string, key: string) {
  const digest = createHash('sha1')
    .update(Buffer.from(workspaceId.replaceAll('-', ''), 'hex'))
    .update(key)
    .digest()
    .subarray(0, 16);
  digest[6] = (digest[6]! & 0x0f) | 0x50;
  digest[8] = (digest[8]! & 0x3f) | 0x80;
  const hex = digest.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function seedFixtures(prisma: PrismaClient, input: SeedInput) {
  const data = seedInputSchema.parse(input);
  const userIds = [
    data.adminUserId,
    data.agentUserId,
    data.viewerUserId,
    data.pixelAdminUserId,
  ];
  return prisma.$transaction(
    async (tx) => {
      const users = await tx.$queryRaw<
        Array<{ id: string; email: string }>
      >`SELECT id,email FROM auth.users WHERE id IN (${Prisma.join(userIds.map((v) => Prisma.sql`${v}::uuid`))}) AND email IS NOT NULL AND email_confirmed_at IS NOT NULL AND deleted_at IS NULL AND (banned_until IS NULL OR banned_until<=clock_timestamp()) FOR SHARE`;
      if (users.length !== 4)
        throw new Error(
          'Four distinct verified active Auth users are required',
        );
      for (const user of users)
        await tx.profile.upsert({
          where: { id: user.id },
          create: { id: user.id, email: user.email.trim().toLowerCase() },
          update: {},
        });
      for (const workspace of [
        {
          id: data.workspaceId,
          name: 'AcmeCloud',
          slug: `acme-cloud-${data.workspaceId.slice(0, 8)}`,
          members: [
            { id: data.adminUserId, role: 'ADMIN' as const },
            { id: data.agentUserId, role: 'AGENT' as const },
            { id: data.viewerUserId, role: 'VIEWER' as const },
          ],
        },
        {
          id: data.pixelWorkspaceId,
          name: 'PixelDesk',
          slug: `pixel-desk-${data.pixelWorkspaceId.slice(0, 8)}`,
          members: [{ id: data.pixelAdminUserId, role: 'ADMIN' as const }],
        },
      ]) {
        const existing = await tx.workspace.findUnique({
          where: { id: workspace.id },
        });
        if (
          existing &&
          (existing.slug !== workspace.slug || existing.name !== workspace.name)
        )
          throw new Error(
            'Refusing a workspace not owned by this fixture namespace',
          );
        await tx.workspace.upsert({
          where: { id: workspace.id },
          create: {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
          },
          update: {},
        });
        await tx.$queryRaw`SELECT id FROM handled."Workspace" WHERE id=${workspace.id}::uuid FOR UPDATE`;
        for (const member of workspace.members)
          await tx.membership.upsert({
            where: {
              workspaceId_userId: {
                workspaceId: workspace.id,
                userId: member.id,
              },
            },
            create: {
              id: fixtureId(workspace.id, `member:${member.id}`),
              workspaceId: workspace.id,
              userId: member.id,
              role: member.role,
            },
            update: {},
          });
      }
      const workspaceId = data.workspaceId;
      const admin = await tx.membership.findUniqueOrThrow({
        where: {
          workspaceId_userId: { workspaceId, userId: data.adminUserId },
        },
      });
      const periodStart = new Date('2026-10-01T00:00:00.000Z'),
        periodEnd = new Date('2026-10-31T23:59:59.000Z');
      const cases = [
        {
          ref: '1001',
          name: 'Maya Rahman',
          email: 'maya@example.com',
          plan: 'PRO_MONTHLY',
          category: 'BILLING_DUPLICATE_CHARGE' as const,
          subject: "I was charged twice for this month's Pro plan.",
        },
        {
          ref: '1002',
          name: 'Daniel Lee',
          email: 'daniel@example.com',
          plan: 'TEAM_MONTHLY',
          category: 'SUBSCRIPTION_CANCELLATION' as const,
          subject:
            'I want to cancel but keep access until the end of the month.',
        },
        {
          ref: '1003',
          name: 'Sofia Karim',
          email: 'sofia@example.com',
          plan: 'STARTER_MONTHLY',
          category: 'PRODUCT_ACCESS_ISSUE' as const,
          subject: 'My payment succeeded but the app says I have no access.',
        },
      ];
      const tickets: string[] = [];
      for (const c of cases) {
        const customerId = fixtureId(workspaceId, `CUS-${c.ref}`),
          subscriptionId = fixtureId(workspaceId, `SUB-${c.ref}`),
          ticketId = fixtureId(workspaceId, `TKT-${c.ref}`);
        tickets.push(ticketId);
        await tx.customer.upsert({
          where: { workspaceId_id: { workspaceId, id: customerId } },
          create: {
            id: customerId,
            workspaceId,
            externalRef: `CUS-${c.ref}`,
            name: c.name,
            email: c.email,
          },
          update: {},
        });
        await tx.subscription.upsert({
          where: { workspaceId_id: { workspaceId, id: subscriptionId } },
          create: {
            id: subscriptionId,
            workspaceId,
            customerId,
            externalRef: `SUB-${c.ref}`,
            planCode: c.plan,
            productCode: 'ACME_APP',
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          },
          update: {},
        });
        await tx.productAccess.upsert({
          where: {
            workspaceId_id: {
              workspaceId,
              id: fixtureId(workspaceId, `ACCESS-${c.ref}`),
            },
          },
          create: {
            id: fixtureId(workspaceId, `ACCESS-${c.ref}`),
            workspaceId,
            customerId,
            productCode: 'ACME_APP',
            status: c.ref === '1003' ? 'REVOKED' : 'ACTIVE',
            reason: c.ref === '1003' ? 'SYNC_ERROR' : null,
            lastSyncedAt: periodStart,
          },
          update: {},
        });
        await tx.ticket.upsert({
          where: { workspaceId_id: { workspaceId, id: ticketId } },
          create: {
            id: ticketId,
            workspaceId,
            reference: `TKT-${c.ref}`,
            subject: c.subject,
            category: c.category,
            customerId,
            customerVerifiedAt: periodStart,
            customerVerifiedById: admin.id,
            source: 'AGENT',
            requesterEmail: c.email,
          },
          update: {},
        });
        const messageId = fixtureId(workspaceId, `message:${c.ref}`);
        if (!(await tx.ticketMessage.findUnique({ where: { id: messageId } })))
          await tx.ticketMessage.create({
            data: {
              id: messageId,
              workspaceId,
              ticketId,
              authorType: 'CUSTOMER',
              body: c.subject,
            },
          });
        if (
          !(await tx.auditEvent.findUnique({
            where: { id: fixtureId(workspaceId, `audit:${c.ref}`) },
          }))
        )
          await tx.auditEvent.create({
            data: {
              id: fixtureId(workspaceId, `audit:${c.ref}`),
              workspaceId,
              entityType: 'ticket',
              entityId: ticketId,
              eventType: 'fixture.synthetic_customer_verified',
              actorType: 'SYSTEM',
              requestId: 'fixture-setup',
              metadata: {
                customerId,
                verification:
                  'Controlled synthetic mapping only; never infer ownership from public hints.',
              },
            },
          });
      }
      for (const payment of [
        { ref: 'PAY-9001', customer: '1001', amount: 2900 },
        { ref: 'PAY-9002', customer: '1001', amount: 2900 },
        { ref: 'PAY-9003', customer: '1003', amount: 1900 },
      ])
        await tx.payment.upsert({
          where: {
            workspaceId_id: {
              workspaceId,
              id: fixtureId(workspaceId, payment.ref),
            },
          },
          create: {
            id: fixtureId(workspaceId, payment.ref),
            workspaceId,
            customerId: fixtureId(workspaceId, `CUS-${payment.customer}`),
            subscriptionId: fixtureId(workspaceId, `SUB-${payment.customer}`),
            externalRef: payment.ref,
            billingPeriodKey: '2026-10',
            amountMinor: payment.amount,
            currency: 'USD',
            status: 'SETTLED',
            paidAt: periodStart,
          },
          update: {},
        });
      const ws = await tx.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
      });
      if (ws.ticketSequence < 1003)
        await tx.workspace.update({
          where: { id: workspaceId },
          data: { ticketSequence: 1003 },
        });
      const pixelCustomer = fixtureId(data.pixelWorkspaceId, 'CUS-PIXEL');
      await tx.customer.upsert({
        where: {
          workspaceId_id: {
            workspaceId: data.pixelWorkspaceId,
            id: pixelCustomer,
          },
        },
        create: {
          id: pixelCustomer,
          workspaceId: data.pixelWorkspaceId,
          externalRef: 'CUS-PIXEL',
          name: 'Pixel customer',
          email: 'pixel@example.invalid',
        },
        update: {},
      });
      const pixelTicket = fixtureId(data.pixelWorkspaceId, 'TKT-1001');
      await tx.ticket.upsert({
        where: {
          workspaceId_id: {
            workspaceId: data.pixelWorkspaceId,
            id: pixelTicket,
          },
        },
        create: {
          id: pixelTicket,
          workspaceId: data.pixelWorkspaceId,
          reference: 'TKT-1001',
          subject: 'PixelDesk isolation fixture',
          customerId: pixelCustomer,
        },
        update: {},
      });
      const pixelWs = await tx.workspace.findUniqueOrThrow({
        where: { id: data.pixelWorkspaceId },
      });
      if (pixelWs.ticketSequence < 1001)
        await tx.workspace.update({
          where: { id: data.pixelWorkspaceId },
          data: { ticketSequence: 1001 },
        });
      return {
        workspaceId,
        pixelWorkspaceId: data.pixelWorkspaceId,
        ticketIds: tickets,
      };
    },
    { isolationLevel: 'Serializable', maxWait: 5000, timeout: 15000 },
  );
}
