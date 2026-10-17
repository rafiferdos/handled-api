import { Module } from '@nestjs/common';
import { ProposalRepository } from './proposal.repository.js';
import { ProposalService } from './proposal.service.js';
import { ProposalController } from './proposal.controller.js';
import { ActionModule } from '../action/action.module.js';
@Module({
  imports: [ActionModule],
  providers: [ProposalRepository, ProposalService],
  controllers: [ProposalController],
  exports: [ProposalRepository, ProposalService],
})
export class ProposalModule {}
