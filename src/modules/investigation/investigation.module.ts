import { Module } from '@nestjs/common';
import { InvestigationRepository } from './investigation.repository.js';
import { InvestigationService } from './investigation.service.js';
import { InvestigationProcessor } from './investigation-processor.js';
import { InvestigationController } from './investigation.controller.js';
import { ProposalModule } from '../proposal/proposal.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { KnowledgeModule } from '../knowledge/knowledge.module.js';
import { ReadTools } from '../ai/read-tools.js';
@Module({
  imports: [ProposalModule, BillingModule, KnowledgeModule],
  providers: [
    InvestigationRepository,
    InvestigationService,
    InvestigationProcessor,
    ReadTools,
  ],
  controllers: [InvestigationController],
  exports: [InvestigationRepository, InvestigationService],
})
export class InvestigationModule {}
