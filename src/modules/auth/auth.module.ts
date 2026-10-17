import { Global, Module } from '@nestjs/common';
import { AccessContextResolver } from '../../common/contracts/access-context.js';
import { JwtVerifier } from './jwt-verifier.js';
import { SupabaseAccessContextResolver } from './supabase-access-context.resolver.js';

@Global()
@Module({
  providers: [
    JwtVerifier,
    { provide: AccessContextResolver, useClass: SupabaseAccessContextResolver },
  ],
  exports: [AccessContextResolver],
})
export class AuthModule {}
