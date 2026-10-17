import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { testDatabaseUrl } from '../test/database/database-url.ts';

const databaseUrl = testDatabaseUrl(process.env.TEST_DATABASE_URL);
const env = {
  ...process.env,
  NODE_ENV: 'test',
  TEST_DATABASE_URL: databaseUrl,
  DATABASE_URL: databaseUrl,
  DIRECT_URL: databaseUrl,
};

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  const { rows } = await client.query('SELECT current_database() AS name');
  if (rows[0]?.name !== 'handled_test')
    throw new Error('Refusing non-test database');
  // Only this explicit disposable database gets fixture roles. No Auth schema
  // or role is created by an application migration.
  await client.query(
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF; IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$",
  );
} finally {
  await client.end();
}

for (const args of [
  ['node_modules/prisma/build/index.js', 'generate'],
  ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
  [
    'node_modules/vitest/vitest.mjs',
    'run',
    '--config',
    'vitest.config.db.ts',
    ...process.argv.slice(2).filter((argument) => argument !== '--'),
  ],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
