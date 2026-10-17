import { Module } from '@nestjs/common';
import { ProposalRepository } from './proposal.repository.js';
@Module({ providers: [ProposalRepository], exports: [ProposalRepository] })
export class ProposalModule {}
