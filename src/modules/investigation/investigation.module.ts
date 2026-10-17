import { Module } from '@nestjs/common';
import { InvestigationRepository } from './investigation.repository.js';
@Module({
  providers: [InvestigationRepository],
  exports: [InvestigationRepository],
})
export class InvestigationModule {}
