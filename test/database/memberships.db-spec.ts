import {
  createActorFixture,
  createAuthFixture,
  createTestDatabase,
} from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { MembershipService } from '../../src/modules/workspace/membership.service.js';
import { InvitationService } from '../../src/modules/workspace/invitation.service.js';
import { ProfileService } from '../../src/modules/auth/profile.service.js';
import { WorkspaceRole } from '../../src/common/contracts/access-context.js';
const db = createTestDatabase();
const uow = new UnitOfWork(db.prisma);
const members = new MembershipService(uow);
const invites = new InvitationService(uow);
const profiles = new ProfileService(uow);
afterAll(() => db.close());

it('single-use invitations verify fresh email and cannot escalate an existing member', async () => {
  const admin = await createActorFixture(db.prisma);
  const recipient = await createAuthFixture(db.prisma);
  await profiles.bootstrap(recipient, {});
  const issued = await invites.create(admin, {
    email: recipient.email.toUpperCase(),
    role: WorkspaceRole.AGENT,
  });
  expect(issued.token.length).toBeGreaterThanOrEqual(40);
  expect(
    JSON.stringify(await invites.list(admin, { page: 1, limit: 20 })),
  ).not.toContain(issued.token);
  const stored = await db.prisma.invite.findFirstOrThrow({
    where: { workspaceId: admin.workspaceId },
  });
  expect(stored.tokenHash).not.toBe(issued.token);
  const stranger = await createAuthFixture(db.prisma);
  await expect(invites.accept(stranger, issued.token)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  });
  const accepted = await Promise.allSettled([
    invites.accept(recipient, issued.token),
    invites.accept(recipient, issued.token),
  ]);
  expect(accepted.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect(
    await db.prisma.membership.count({
      where: { workspaceId: admin.workspaceId, userId: recipient.userId },
    }),
  ).toBe(1);
  await expect(
    invites.create(admin, {
      email: recipient.email,
      role: WorkspaceRole.ADMIN,
    }),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_FAILED' });
});

it('rejects revoked/expired invites and revalidates the initiator after guard time', async () => {
  const admin = await createActorFixture(db.prisma);
  const recipient = await createAuthFixture(db.prisma);
  await profiles.bootstrap(recipient, {});
  const issued = await invites.create(admin, {
    email: recipient.email,
    role: WorkspaceRole.VIEWER,
  });
  await invites.revoke(admin, issued.id);
  await expect(invites.accept(recipient, issued.token)).rejects.toMatchObject({
    code: 'INVALID_STATE_TRANSITION',
  });
  const expired = await invites.create(admin, {
    email: recipient.email,
    role: WorkspaceRole.VIEWER,
  });
  await db.prisma.invite.update({
    where: { id: expired.id },
    data: {
      createdAt: new Date(Date.now() - 60000),
      expiresAt: new Date(Date.now() - 1000),
    },
  });
  await expect(invites.accept(recipient, expired.token)).rejects.toMatchObject({
    code: 'INVALID_STATE_TRANSITION',
  });
  await db.prisma
    .$executeRaw`DELETE FROM auth.sessions WHERE id = ${admin.sessionId}::uuid`;
  await expect(
    invites.create(admin, {
      email: recipient.email,
      role: WorkspaceRole.VIEWER,
    }),
  ).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
});

it('concurrent admin demotion cannot remove the last active admin', async () => {
  const a = await createActorFixture(db.prisma);
  const identityB = await createAuthFixture(db.prisma);
  await profiles.bootstrap(identityB, {});
  const bMember = await db.prisma.membership.create({
    data: {
      workspaceId: a.workspaceId,
      userId: identityB.userId,
      role: 'ADMIN',
    },
  });
  const aMember = await db.prisma.membership.findUniqueOrThrow({
    where: {
      workspaceId_userId: { workspaceId: a.workspaceId, userId: a.userId },
    },
  });
  const b = { ...identityB, workspaceId: a.workspaceId, requestId: 'race-b' };
  const result = await Promise.allSettled([
    members.update(a, aMember.id, { role: WorkspaceRole.AGENT }),
    members.update(b, bMember.id, { role: WorkspaceRole.AGENT }),
  ]);
  expect(result.some((r) => r.status === 'rejected')).toBe(true);
  expect(
    await db.prisma.membership.count({
      where: { workspaceId: a.workspaceId, status: 'ACTIVE', role: 'ADMIN' },
    }),
  ).toBe(1);
  const demoted = await db.prisma.membership.findFirstOrThrow({
    where: { workspaceId: a.workspaceId, role: 'AGENT' },
  });
  await expect(
    invites.list(demoted.userId === a.userId ? a : b, { page: 1, limit: 20 }),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
});
