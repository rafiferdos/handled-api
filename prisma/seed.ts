import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { seedFixtures } from './seed-data.js';

async function main() {
  // No implicit default, no reset, and no URL/credential logging on any failure.
  if (
    process.env.SEED_MODE !== 'scoped' ||
    process.env.SEED_ALLOW_SCOPED !== 'true'
  )
    throw new Error('Explicit scoped setup is required');
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Database configuration is required');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: 2,
      connectionTimeoutMillis: 5000,
    }),
  });
  try {
    await seedFixtures(prisma, {
      workspaceId: process.env.SEED_WORKSPACE_ID || '',
      pixelWorkspaceId: process.env.SEED_PIXEL_WORKSPACE_ID || '',
      adminUserId: process.env.SEED_ADMIN_USER_ID || '',
      agentUserId: process.env.SEED_AGENT_USER_ID || '',
      viewerUserId: process.env.SEED_VIEWER_USER_ID || '',
      pixelAdminUserId: process.env.SEED_PIXEL_ADMIN_USER_ID || '',
    });
    process.stdout.write(
      'Scoped synthetic fixtures are ready. Existing business changes were preserved.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  process.stderr.write(
    'Fixture setup failed. Check explicit scope, verified Auth users and database access. No reset was performed.\n',
  );
  process.exitCode = 1;
});
