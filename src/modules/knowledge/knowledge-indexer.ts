import { Inject, Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import { AiProvider } from '../ai/ai-provider.js';
import { validateEmbedding } from '../ai/provider.schemas.js';
import { JobRegistry } from '../queue/outbox-dispatcher.js';
import type { JobExecution } from '../queue/outbox-dispatcher.js';
import { chunkText } from './chunking.js';
@Injectable()
export class KnowledgeIndexer implements OnModuleInit {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(AiProvider) private readonly provider: AiProvider,
    @Inject(JobRegistry) private readonly registry: JobRegistry,
  ) {}
  onModuleInit() {
    this.registry.register('knowledge-index', (job, signal) =>
      this.process(job, signal),
    );
  }
  private async process(job: JobExecution, signal: AbortSignal) {
    const revision = await this.uow.run((tx) =>
      tx.knowledgeRevision.findUnique({
        where: {
          workspaceId_id: { workspaceId: job.workspaceId, id: job.aggregateId },
        },
        include: { document: true },
      }),
    );
    if (
      !revision ||
      revision.document.status !== 'PUBLISHED' ||
      revision.document.publishedVersion !== revision.version
    )
      return;
    const model = this.provider.metadata().embeddingModel;
    try {
      const chunks = chunkText(revision.body),
        vectors: string[] = [];
      for (const chunk of chunks) {
        signal.throwIfAborted();
        vectors.push(
          JSON.stringify(
            validateEmbedding(
              await this.provider.embed(chunk.content, 'document', signal),
            ),
          ),
        );
      }
      await this.uow.run(async (tx) => {
        const workspaces = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM handled."Workspace" WHERE id=${job.workspaceId}::uuid AND status='ACTIVE' FOR UPDATE`;
        await job.assertCurrent(tx);
        if (!workspaces[0]) {
          await job.complete(tx);
          return;
        }
        const current = await tx.knowledgeDocument.findUnique({
          where: {
            workspaceId_id: {
              workspaceId: job.workspaceId,
              id: revision.documentId,
            },
          },
        });
        if (
          current?.status !== 'PUBLISHED' ||
          current.publishedVersion !== revision.version
        ) {
          await job.complete(tx);
          return;
        }
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          await tx.$executeRaw`INSERT INTO handled."KnowledgeChunk" (id,"workspaceId","documentId","documentVersion","chunkIndex",content,"contentHash","embeddingModel",embedding) VALUES (${randomUUID()}::uuid,${job.workspaceId}::uuid,${revision.documentId}::uuid,${revision.version},${chunk.chunkIndex},${chunk.content},${chunk.contentHash},${model},${vectors[i]}::extensions.vector) ON CONFLICT ("workspaceId","documentId","documentVersion","embeddingModel","chunkIndex") DO NOTHING`;
        }
        await tx.knowledgeRevision.update({
          where: { id: revision.id },
          data: {
            indexStatus: 'READY',
            embeddingModel: model,
            failureCode: null,
          },
        });
        await job.complete(tx);
      });
    } catch (error) {
      await this.uow.run(async (tx) => {
        await job.assertCurrent(tx);
        await tx.knowledgeRevision.update({
          where: { id: revision.id },
          data: { indexStatus: 'FAILED', failureCode: 'AI_PROVIDER_ERROR' },
        });
      });
      throw error;
    }
  }
}
