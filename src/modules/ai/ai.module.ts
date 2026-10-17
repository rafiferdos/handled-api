import { Global, Module } from '@nestjs/common';
import { AiProvider } from './ai-provider.js';
import { GeminiProvider } from './gemini-provider.js';

@Global()
@Module({
  providers: [{ provide: AiProvider, useClass: GeminiProvider }],
  exports: [AiProvider],
})
export class AiModule {}
