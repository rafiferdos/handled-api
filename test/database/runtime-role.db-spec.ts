import { createActorFixture, createTestDatabase } from './helpers.js';
import { assertIdentity } from '../../src/common/database/workspace-actor.js';
const db = createTestDatabase();
afterAll(() => db.close());
it('checks current identity with a private function grant and no managed-auth DML privilege', async () => {
  const actor = await createActorFixture(db.prisma);
  await db.prisma.$executeRawUnsafe(
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='handled_test_runtime') THEN CREATE ROLE handled_test_runtime NOLOGIN; END IF; END $$",
  );
  await db.prisma.$executeRawUnsafe(
    'GRANT USAGE ON SCHEMA handled TO handled_test_runtime',
  );
  await db.prisma.$executeRawUnsafe(
    'GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA handled TO handled_test_runtime',
  );
  await db.prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe('SET LOCAL ROLE handled_test_runtime');
    expect(await assertIdentity(tx, actor)).toEqual({
      id: actor.userId,
      email: actor.email,
    });
  });
});
