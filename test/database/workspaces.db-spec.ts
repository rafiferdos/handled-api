import { randomUUID } from 'node:crypto';
import {
  createActorFixture,
  createAuthFixture,
  createTestDatabase,
} from './helpers.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';
import { ProfileService } from '../../src/modules/auth/profile.service.js';
import { WorkspaceService } from '../../src/modules/workspace/workspace.service.js';

const db = createTestDatabase();
const uow = new UnitOfWork(db.prisma);
const profiles = new ProfileService(uow);
const workspaces = new WorkspaceService(uow);
afterAll(() => db.close());

it('bootstraps only trusted identity and creates workspace with its first admin atomically', async () => {
  const identity = await createAuthFixture(db.prisma);
  const first = await profiles.bootstrap(identity, { displayName: 'Lead' });
  const again = await profiles.bootstrap(identity, { displayName: 'Lead' });
  expect(again.id).toBe(first.id);
  expect(first.email).toBe(identity.email);
  const slug = `Case-${randomUUID().slice(0, 8)}`;
  const ws = await workspaces.create(identity, { name: 'Acme', slug });
  expect(ws.slug).toBe(slug.toLowerCase());
  expect(
    await db.prisma.membership.count({
      where: {
        workspaceId: ws.id,
        userId: identity.userId,
        role: 'ADMIN',
        status: 'ACTIVE',
      },
    }),
  ).toBe(1);
  await expect(
    workspaces.create(identity, {
      name: 'Duplicate',
      slug: slug.toLowerCase(),
    }),
  ).rejects.toMatchObject({ code: 'DUPLICATE_RESOURCE' });
});

it('lists only active memberships and scopes detail/count/settings by current authority', async () => {
  const a = await createActorFixture(db.prisma);
  const b = await createActorFixture(db.prisma);
  expect((await workspaces.list(a, { page: 1, limit: 20 })).meta.total).toBe(1);
  await expect(
    workspaces.detail({ ...a, workspaceId: b.workspaceId }),
  ).rejects.toMatchObject({ code: 'RESOURCE_NOT_FOUND' });
  const updated = await workspaces.update(a, {
    name: 'Updated',
    expectedVersion: 1,
  });
  expect(updated).toMatchObject({ name: 'Updated', version: 2 });
  await expect(
    workspaces.update(a, { name: 'Stale', expectedVersion: 1 }),
  ).rejects.toMatchObject({ code: 'INVALID_STATE_TRANSITION' });
  const viewer = await createAuthFixture(db.prisma);
  await profiles.bootstrap(viewer, {});
  await db.prisma.membership.create({
    data: { workspaceId: a.workspaceId, userId: viewer.userId, role: 'VIEWER' },
  });
  await expect(
    workspaces.update(
      { ...viewer, workspaceId: a.workspaceId, requestId: 'viewer' },
      { name: 'No', expectedVersion: 2 },
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  await db.prisma.workspace.update({
    where: { id: a.workspaceId },
    data: { status: 'SUSPENDED' },
  });
  expect((await workspaces.list(a, { page: 1, limit: 20 })).meta.total).toBe(0);
});
