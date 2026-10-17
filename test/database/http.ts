import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import type { VerifiedIdentity } from '../../src/common/database/workspace-actor.js';
import { AppModule } from '../../src/app.module.js';
import { PrismaService } from '../../src/common/database/prisma.service.js';
import { configureApp } from '../../src/config/configure-app.js';
import { validateEnvironment } from '../../src/config/environment.js';

export async function createTestApplication(prisma: PrismaClient) {
  const key = await generateKeyPair('ES256');
  const jwk = {
    ...(await exportJWK(key.publicKey)),
    alg: 'ES256',
    kid: 'http-fixture',
    use: 'sig',
  };
  const jwks = createServer((_req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ keys: [jwk] }));
  });
  await new Promise<void>((resolve) => jwks.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(jwks.address() as AddressInfo).port}`;
  const config = new ConfigService({
    ...validateEnvironment({
      NODE_ENV: 'test',
      DATABASE_URL: process.env.TEST_DATABASE_URL,
    }),
    SUPABASE_URL: url,
    SUPABASE_JWT_ISSUER: `${url}/auth/v1`,
    SUPABASE_JWKS_URL: `${url}/jwks`,
    SUPPORT_FORM_TOKEN_PEPPER: 'local-test-pepper-at-least-32-characters',
    PUBLIC_INTAKE_ORIGINS: 'https://support.example.invalid',
  });
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(ConfigService)
    .useValue(config)
    .compile();
  const app = module.createNestApplication<NestExpressApplication>({
    logger: false,
  });
  configureApp(app);
  await app.init();
  return {
    app,
    sign: (identity: VerifiedIdentity) =>
      new SignJWT({ session_id: identity.sessionId })
        .setSubject(identity.userId)
        .setIssuedAt()
        .setIssuer(`${url}/auth/v1`)
        .setAudience('authenticated')
        .setExpirationTime(identity.expiresAt)
        .setProtectedHeader({ alg: 'ES256', kid: 'http-fixture' })
        .sign(key.privateKey),
    close: async () => {
      await app.close();
      await new Promise<void>((resolve, reject) =>
        jwks.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}
