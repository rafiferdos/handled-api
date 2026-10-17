import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isUUID } from 'class-validator';
import { createRemoteJWKSet, errors, jwtVerify } from 'jose';
import type { VerifiedIdentity } from '../../common/database/workspace-actor.js';
import { AppException } from '../../common/errors/app.exception.js';

@Injectable()
export class JwtVerifier {
  private readonly issuer: string | undefined;
  private readonly audience: string;
  private readonly keys: ReturnType<typeof createRemoteJWKSet> | undefined;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const base = config.get<string>('SUPABASE_URL');
    this.issuer = base
      ? config.get<string>('SUPABASE_JWT_ISSUER') ||
        `${base.replace(/\/$/, '')}/auth/v1`
      : undefined;
    this.audience =
      config.get<string>('SUPABASE_JWT_AUDIENCE') || 'authenticated';
    if (this.issuer)
      this.keys = createRemoteJWKSet(
        new URL(
          config.get<string>('SUPABASE_JWKS_URL') ||
            `${this.issuer}/.well-known/jwks.json`,
        ),
        { timeoutDuration: 3000, cooldownDuration: 30000, cacheMaxAge: 600000 },
      );
  }

  async verify(
    authorization: string | undefined,
  ): Promise<VerifiedIdentity | null> {
    if (
      !this.keys ||
      !this.issuer ||
      !authorization ||
      authorization.length > 8192 ||
      !/^Bearer [A-Za-z0-9_.-]+$/i.test(authorization)
    )
      return null;
    try {
      const { payload } = await jwtVerify(authorization.slice(7), this.keys, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ['ES256', 'RS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'session_id'],
      });
      if (
        !payload.sub ||
        !isUUID(payload.sub) ||
        typeof payload.session_id !== 'string' ||
        !isUUID(payload.session_id) ||
        !Number.isSafeInteger(payload.exp) ||
        payload.is_anonymous === true
      )
        return null;
      return {
        userId: payload.sub.toLowerCase(),
        sessionId: payload.session_id.toLowerCase(),
        expiresAt: payload.exp!,
      };
    } catch (error) {
      if (
        error instanceof errors.JWKSTimeout ||
        (error instanceof errors.JOSEError &&
          ['ERR_JWKS_INVALID', 'ERR_JWK_INVALID', 'ERR_JOSE_GENERIC'].includes(
            error.code,
          )) ||
        !(error instanceof errors.JOSEError)
      )
        throw new AppException('DEPENDENCY_UNAVAILABLE');
      return null;
    }
  }
}
