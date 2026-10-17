// Explicit opt-in only: never reads DATABASE_URL or the project's .env file.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import pg from 'pg';

const url = process.env.PROFILE_WORKSPACE_TEST_DATABASE_URL;
if (
  !url ||
  !['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname)
) {
  throw new Error(
    'Set PROFILE_WORKSPACE_TEST_DATABASE_URL to a disposable local PostgreSQL database.',
  );
}
const folder = mkdtempSync(join(tmpdir(), 'handled-schema-test-'));
const schemaName = `profile_workspace_${randomUUID().replaceAll('-', '')}`;
const client = new pg.Client({ connectionString: url });
let passed = 0;
try {
  // Other owners' tables are deliberately excluded, while all four models'
  // columns, enums, indexes and internal relations come from the real schema.
  let schema = 'datasource db {\n provider = "postgresql"\n}\n';
  for (const name of ['Profile', 'Workspace', 'Membership', 'Invite']) {
    schema +=
      readFileSync(`prisma/models/${name}.prisma`, 'utf8')
        .split('\n')
        .filter(
          (line) =>
            !/^\s*(dataAccessRequests|providerConnections|billingAccount|subscriptions|installedConnections)\s/.test(
              line,
            ),
        )
        .join('\n') + '\n';
  }
  const schemaFile = join(folder, 'schema.prisma');
  writeFileSync(schemaFile, schema);
  const ddl = execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'diff',
      '--from-empty',
      '--to-schema',
      schemaFile,
      '--script',
    ],
    { encoding: 'utf8' },
  ).replace('CREATE SCHEMA IF NOT EXISTS "public";', '');
  await client.connect();
  await client.query('BEGIN');
  await client.query(`CREATE SCHEMA "${schemaName}"`);
  await client.query(`SET LOCAL search_path TO "${schemaName}", public`);
  await client.query(ddl);
  await client.query(
    readFileSync('prisma/sql/profile-workspace-constraints.sql', 'utf8'),
  );

  async function check(label, sql, code) {
    await client.query('SAVEPOINT scenario');
    try {
      if (code)
        await assert.rejects(
          client.query(sql),
          (error) =>
            Array.isArray(code)
              ? code.includes(error.code)
              : error.code === code,
          label,
        );
      else await client.query(sql);
    } finally {
      await client.query('ROLLBACK TO SAVEPOINT scenario');
    }
    passed++;
    console.log(`PASS ${label}`);
  }
  const a = randomUUID(),
    b = randomUUID(),
    w1 = randomUUID(),
    w2 = randomUUID();
  await client.query(
    'INSERT INTO "Profile" (id,email) VALUES ($1,$2),($3,$4)',
    [a, 'a@example.com', b, 'b@example.com'],
  );
  await client.query(
    "INSERT INTO \"Workspace\" (id,slug,name,\"createdByUserId\") VALUES ($1,'alpha','Alpha',$3),($2,'beta','Beta',$3)",
    [w1, w2, a],
  );
  await client.query(
    'INSERT INTO "Membership" ("workspaceId","userId",role) VALUES ($1,$2,\'ADMIN\')',
    [w1, a],
  );
  const invite = (workspace = w1, extra = '', value = '') =>
    `INSERT INTO "Invite" ("workspaceId",email,"tokenHash","expiresAt","createdByUserId"${extra}) VALUES ('${workspace}','guest@example.com','${randomUUID()}',now()+interval '1 hour','${a}'${value})`;

  await check('valid invitation', invite());
  await check('creator cannot invite across tenants', invite(w2), '23503');
  await check(
    'inviter must belong to the same workspace',
    `INSERT INTO "Membership" ("workspaceId","userId","invitedByUserId") VALUES ('${w2}','${b}','${a}')`,
    '23503',
  );
  await check(
    'same-workspace inviter is accepted',
    `INSERT INTO "Membership" ("workspaceId","userId","invitedByUserId") VALUES ('${w1}','${b}','${a}')`,
  );
  await check(
    'duplicate membership rejected',
    `INSERT INTO "Membership" ("workspaceId","userId") VALUES ('${w1}','${a}')`,
    '23505',
  );
  await check(
    'profile deletion restricted by history',
    `DELETE FROM "Profile" WHERE id='${a}'`,
    ['23503', '23001'],
  );
  await check(
    'workspace deletion restricted by membership',
    `DELETE FROM "Workspace" WHERE id='${w1}'`,
    ['23503', '23001'],
  );
  await check(
    'disabled membership needs disabledAt',
    `UPDATE "Membership" SET status='DISABLED' WHERE "workspaceId"='${w1}'`,
    '23514',
  );
  await check(
    'valid disabled membership',
    `UPDATE "Membership" SET status='DISABLED',"disabledAt"=now() WHERE "workspaceId"='${w1}'`,
  );
  await check(
    'active membership cannot have disabledAt',
    `UPDATE "Membership" SET "disabledAt"=now() WHERE "workspaceId"='${w1}'`,
    '23514',
  );
  await check(
    'accepted invite needs actor and timestamp',
    invite(w1, ',status', ",'ACCEPTED'"),
    '23514',
  );
  await check(
    'valid accepted invite',
    invite(
      w1,
      ',status,"acceptedAt","acceptedByUserId"',
      `,'ACCEPTED',now(),'${b}'`,
    ),
  );
  await check(
    'revoked invite needs timestamp',
    invite(w1, ',status', ",'REVOKED'"),
    '23514',
  );
  await check(
    'valid revoked invite',
    invite(w1, ',status,"revokedAt"', ",'REVOKED',now()"),
  );
  await check(
    'pending invite cannot have acceptance fields',
    invite(w1, ',"acceptedAt","acceptedByUserId"', `,now(),'${b}'`),
    '23514',
  );
  await check(
    'expiry must follow creation',
    invite().replace("now()+interval '1 hour'", "now()-interval '1 hour'"),
    '23514',
  );
  await check(
    'one case-insensitive pending invite',
    invite() + ';' + invite().replace('guest@example.com', 'GUEST@example.com'),
    '23505',
  );
  await check(
    'historical invites do not block a pending invite',
    invite() + ';' + invite(w1, ',status', ",'EXPIRED'"),
  );
  await check(
    'same invite email is allowed in separate workspaces',
    `INSERT INTO "Membership" ("workspaceId","userId") VALUES ('${w2}','${a}');` +
      invite() +
      ';' +
      invite(w2),
  );
  await check(
    'invitation token hashes cannot be reused',
    invite() +
      ';' +
      invite().replace(
        /'guest@example.com','[^']+'/,
        '\'other@example.com\',(SELECT "tokenHash" FROM "Invite" LIMIT 1)',
      ),
    '23505',
  );
  await check(
    'Profile IDs must be supplied by the auth owner',
    'INSERT INTO "Profile" (email) VALUES (\'new@example.com\')',
    '23502',
  );
  await check(
    'profile emails remain unique',
    `INSERT INTO "Profile" (id,email) VALUES ('${randomUUID()}','a@example.com')`,
    '23505',
  );
  await check(
    'profile email normalized',
    `UPDATE "Profile" SET email=' A@example.com ' WHERE id='${a}'`,
    '23514',
  );
  await check(
    'profile metadata must be object',
    `UPDATE "Profile" SET metadata='[]' WHERE id='${a}'`,
    '23514',
  );
  await check(
    'workspace slug format',
    `UPDATE "Workspace" SET slug='Bad Slug' WHERE id='${w1}'`,
    '23514',
  );
  await check(
    'public form needs token hash',
    `UPDATE "Workspace" SET "publicFormEnabled"=true WHERE id='${w1}'`,
    '23514',
  );
  await check(
    'website must use HTTPS',
    `UPDATE "Workspace" SET "websiteUrl"='http://example.com' WHERE id='${w1}'`,
    '23514',
  );
  await check(
    'workspace settings must be object',
    `UPDATE "Workspace" SET settings='[]' WHERE id='${w1}'`,
    '23514',
  );
  await check(
    'workspace metadata must be object',
    `UPDATE "Workspace" SET metadata='[]' WHERE id='${w1}'`,
    '23514',
  );
  await check(
    'updatedAt cannot precede creation',
    `UPDATE "Profile" SET "updatedAt"="createdAt"-interval '1 second' WHERE id='${a}'`,
    '23514',
  );
  console.log(
    `${passed} database scenarios passed; all test data rolled back.`,
  );
} finally {
  await client.query('ROLLBACK').catch(() => {});
  await client.end();
  if (dirname(resolve(folder)) !== resolve(tmpdir())) {
    throw new Error(
      'Refusing to remove a test directory outside the temporary root.',
    );
  }
  rmSync(folder, { recursive: true, force: true });
}
