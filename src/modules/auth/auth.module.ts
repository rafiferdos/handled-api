import { ProfileService } from './profile.service.js';
import { ProfileController } from './profile.controller.js';
import { Global, Module } from '@nestjs/common';
import { AccessContextResolver } from '../../common/contracts/access-context.js';
import { JwtVerifier } from './jwt-verifier.js';
import { SupabaseAccessContextResolver } from './supabase-access-context.resolver.js';

@Global()
@Module({
  controllers: [ProfileController],
  providers: [
    ProfileService,
    JwtVerifier,
    { provide: AccessContextResolver, useClass: SupabaseAccessContextResolver },
  ],
  exports: [AccessContextResolver, ProfileService],
})
export class AuthModule {}
