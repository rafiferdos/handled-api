import { Module } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service.js';
import { KnowledgeIndexer } from './knowledge-indexer.js';
import { KnowledgeController } from './knowledge.controller.js';

@Module({
  providers: [KnowledgeService, KnowledgeIndexer],
  controllers: [KnowledgeController],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
