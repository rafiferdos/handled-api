import { Global, Module } from '@nestjs/common';
import { AccessContextResolver } from '../../common/contracts/access-context.js';
import { DenyAccessContextResolver } from './deny-access-context.resolver.js';

@Global()
@Module({
  providers: [{ provide: AccessContextResolver, useClass: DenyAccessContextResolver }],
  exports: [AccessContextResolver],
})
export class AuthModule {}
