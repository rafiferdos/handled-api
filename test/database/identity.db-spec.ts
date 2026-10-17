import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { JWTPayload } from 'jose';
import { createActorFixture, createTestDatabase } from './helpers.js';
import { JwtVerifier } from '../../src/modules/auth/jwt-verifier.js';
import { SupabaseAccessContextResolver } from '../../src/modules/auth/supabase-access-context.resolver.js';
import { UnitOfWork } from '../../src/common/database/unit-of-work.js';

const db = createTestDatabase();
const key = await generateKeyPair('ES256');
const jwk = {
  ...(await exportJWK(key.publicKey)),
  kid: 'fixture',
  alg: 'ES256',
  use: 'sig',
};
const server = createServer((_req, res) => {
  if (_req.url === '/unavailable') {
    res.writeHead(503);
    res.end();
    return;
  }
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
const verifier = new JwtVerifier(
  new ConfigService({
    SUPABASE_URL: url,
    SUPABASE_JWT_ISSUER: `${url}/auth/v1`,
    SUPABASE_JWKS_URL: `${url}/jwks`,
    SUPABASE_JWT_AUDIENCE: 'authenticated',
  }),
);
const resolver = new SupabaseAccessContextResolver(
  db.prisma,
  new UnitOfWork(db.prisma),
  verifier,
);
const request = (token: string) =>
  ({ headers: { authorization: `Bearer ${token}` } }) as Request;
async function token(
  user: { userId: string; sessionId: string },
  overrides: JWTPayload = {},
) {
  return new SignJWT({
    sub: user.userId,
    session_id: user.sessionId,
    iss: `${url}/auth/v1`,
    aud: 'authenticated',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 300,
    ...overrides,
  })
    .setProtectedHeader({ alg: 'ES256', kid: 'fixture' })
    .sign(key.privateKey);
}
afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((e) => (e ? reject(e) : resolve())),
  );
  await db.close();
});

describe('real signed identity and current Supabase session', () => {
  it('verifies a real JWKS signature and current identity/membership with uppercase UUID inputs', async () => {
    const f = await createActorFixture(db.prisma);
    expect(
      await resolver.authenticate(
        request(
          await token(f, {
            sub: f.userId.toUpperCase(),
            session_id: f.sessionId.toUpperCase(),
          }),
        ),
      ),
    ).toMatchObject({ id: f.userId, sessionId: f.sessionId, email: f.email });
    expect(
      await resolver.resolveMembership(f.userId, f.workspaceId.toUpperCase()),
    ).toMatchObject({
      userId: f.userId,
      workspaceId: f.workspaceId,
      role: 'ADMIN',
    });
  });

  it.each([
    { iss: 'https://wrong.invalid/auth/v1' },
    { aud: 'other' },
    { exp: 1 },
    { exp: undefined },
    { sub: 'invalid' },
    { session_id: 'invalid' },
  ])('denies invalid required claims %o', async (claims) => {
    const f = await createActorFixture(db.prisma);
    expect(
      await resolver.authenticate(request(await token(f, claims))),
    ).toBeNull();
  });

  it('denies wrong signature and an unapproved algorithm', async () => {
    const f = await createActorFixture(db.prisma);
    const other = await generateKeyPair('ES256');
    const wrong = await new SignJWT({ sub: f.userId })
      .setProtectedHeader({ alg: 'ES256', kid: 'fixture' })
      .sign(other.privateKey);
    const hs = await new SignJWT({ sub: f.userId })
      .setProtectedHeader({ alg: 'HS256' })
      .sign(new Uint8Array(32));
    expect(await resolver.authenticate(request(wrong))).toBeNull();
    expect(await resolver.authenticate(request(hs))).toBeNull();
  });

  it('returns a safe dependency error when the trusted JWKS endpoint is unavailable', async () => {
    const f = await createActorFixture(db.prisma);
    const unavailable = new JwtVerifier(
      new ConfigService({
        SUPABASE_URL: url,
        SUPABASE_JWKS_URL: `${url}/unavailable`,
      }),
    );
    await expect(
      unavailable.verify(`Bearer ${await token(f)}`),
    ).rejects.toMatchObject({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'Dependency unavailable',
    });
  });

  it('rejects timeboxed sessions and deleted accounts', async () => {
    const f = await createActorFixture(db.prisma);
    const jwt = await token(f);
    await db.prisma
      .$executeRaw`UPDATE auth.sessions SET not_after = now()-interval '1 second' WHERE id = ${f.sessionId}::uuid`;
    expect(await resolver.authenticate(request(jwt))).toBeNull();
    await db.prisma
      .$executeRaw`UPDATE auth.sessions SET not_after = NULL WHERE id = ${f.sessionId}::uuid`;
    await db.prisma
      .$executeRaw`UPDATE auth.users SET deleted_at = now() WHERE id = ${f.userId}::uuid`;
    expect(await resolver.authenticate(request(jwt))).toBeNull();
  });

  it('denies logout, unverified and banned accounts despite a valid JWT', async () => {
    const f = await createActorFixture(db.prisma);
    const jwt = await token(f);
    await db.prisma
      .$executeRaw`UPDATE auth.users SET email_confirmed_at = NULL WHERE id = ${f.userId}::uuid`;
    expect(await resolver.authenticate(request(jwt))).toBeNull();
    await db.prisma
      .$executeRaw`UPDATE auth.users SET email_confirmed_at = now(), banned_until = now()+interval '1 day' WHERE id = ${f.userId}::uuid`;
    expect(await resolver.authenticate(request(jwt))).toBeNull();
    await db.prisma
      .$executeRaw`UPDATE auth.users SET banned_until = NULL WHERE id = ${f.userId}::uuid`;
    await db.prisma
      .$executeRaw`DELETE FROM auth.sessions WHERE id = ${f.sessionId}::uuid`;
    expect(await resolver.authenticate(request(jwt))).toBeNull();
  });
});
