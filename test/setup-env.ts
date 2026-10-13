// E2E tests replace PrismaService and never use a developer's real database.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  'postgresql://postgres:test@127.0.0.1:5432/handled_test';
