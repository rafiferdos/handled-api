import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { UnitOfWork } from '../../common/database/unit-of-work.js';
import type { WorkspaceActor } from '../../common/database/workspace-actor.js';
import { assertWorkspaceActor } from '../../common/database/workspace-actor.js';
import { WorkspaceRole } from '../../common/contracts/access-context.js';
import { AppException } from '../../common/errors/app.exception.js';
import { parseContract } from '../../common/validation/parse-contract.js';
import { canonicalJson, sha256 } from '../../common/database/json.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AiProvider } from '../ai/ai-provider.js';
import { validateEmbedding } from '../ai/provider.schemas.js';
import type { EvidenceSource } from '../proposal/contracts/evidence.schema.js';
import { writeAudit } from '../audit/audit-writer.js';
import { enqueueJob } from '../queue/job-contracts.js';
import { policyRulesSchema } from './policy-rules.js';
import { paginated, paginationBounds } from '../../common/utils/pagination.js';
import type { PaginationQueryDto } from '../../common/dto/pagination-query.dto.js';
const admins = [WorkspaceRole.ADMIN];
const contentSchema = z.strictObject({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .min(3)
    .max(100),
  title: z.string().trim().min(1).max(256),
  body: z.string().trim().min(1).max(100000),
  policyRules: policyRulesSchema,
});
const versionSchema = z.strictObject({
  expectedVersion: z.number().int().min(1).max(2147483647),
});
export async function requireDocument(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  id: string,
) {
  const doc = await tx.knowledgeDocument.findUnique({
    where: { workspaceId_id: { workspaceId, id } },
  });
  if (!doc) throw new AppException('RESOURCE_NOT_FOUND');
  return doc;
}
@Injectable()
export class KnowledgeService {
  constructor(
    @Inject(UnitOfWork) private readonly uow: UnitOfWork,
    @Inject(AiProvider) private readonly provider: AiProvider,
  ) {}
  create(actor: WorkspaceActor, input: z.input<typeof contentSchema>) {
    const data = parseContract(contentSchema, input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, admins);
      const row = await tx.knowledgeDocument.create({
        data: { workspaceId: actor.workspaceId, ...data },
      });
      await writeAudit(tx, actor, {
        entityType: 'knowledge',
        entityId: row.id,
        eventType: 'knowledge.created',
      });
      return row;
    });
  }
  update(
    actor: WorkspaceActor,
    id: string,
    input: z.input<typeof contentSchema> & { expectedVersion: number },
  ) {
    const { expectedVersion } = parseContract(versionSchema, {
      expectedVersion: input.expectedVersion,
    });
    const { expectedVersion: _, ...body } = input;
    const data = parseContract(contentSchema, body);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, admins);
      const doc = await requireDocument(tx, actor.workspaceId, id);
      if (doc.version !== expectedVersion || doc.version >= 2147483647)
        throw new AppException('INVALID_STATE_TRANSITION');
      const row = await tx.knowledgeDocument.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
      });
      await writeAudit(tx, actor, {
        entityType: 'knowledge',
        entityId: id,
        eventType: 'knowledge.updated',
        metadata: { version: row.version },
      });
      return row;
    });
  }
  list(actor: WorkspaceActor, query: PaginationQueryDto) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const where = { workspaceId: actor.workspaceId };
      return paginated(
        await tx.knowledgeDocument.findMany({
          where,
          select: {
            id: true,
            slug: true,
            title: true,
            status: true,
            version: true,
            publishedVersion: true,
            updatedAt: true,
          },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          ...paginationBounds(query),
        }),
        await tx.knowledgeDocument.count({ where }),
        query,
      );
    });
  }
  detail(actor: WorkspaceActor, id: string) {
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor);
      const doc = await requireDocument(tx, actor.workspaceId, id);
      const revision = doc.publishedVersion
        ? await tx.knowledgeRevision.findUnique({
            where: {
              workspaceId_documentId_version: {
                workspaceId: actor.workspaceId,
                documentId: id,
                version: doc.publishedVersion,
              },
            },
            select: {
              version: true,
              indexStatus: true,
              embeddingModel: true,
              failureCode: true,
              publishedAt: true,
              contentHash: true,
            },
          })
        : null;
      return { ...doc, publishedRevision: revision };
    });
  }
  publish(
    actor: WorkspaceActor,
    id: string,
    input: z.input<typeof versionSchema>,
  ) {
    this.provider.metadata();
    const data = parseContract(versionSchema, input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, admins);
      const doc = await requireDocument(tx, actor.workspaceId, id);
      if (doc.version !== data.expectedVersion)
        throw new AppException('INVALID_STATE_TRANSITION');
      if (doc.publishedVersion === doc.version && doc.status === 'PUBLISHED')
        return doc;
      const rules = policyRulesSchema.parse(doc.policyRules);
      let revision = await tx.knowledgeRevision.findUnique({
        where: {
          workspaceId_documentId_version: {
            workspaceId: actor.workspaceId,
            documentId: id,
            version: doc.version,
          },
        },
      });
      if (!revision)
        revision = await tx.knowledgeRevision.create({
          data: {
            workspaceId: actor.workspaceId,
            documentId: id,
            version: doc.version,
            title: doc.title,
            body: doc.body,
            policyRules: rules,
            contentHash: sha256(
              canonicalJson({
                title: doc.title,
                body: doc.body,
                policyRules: rules,
              }),
            ),
          },
        });
      await enqueueJob(
        tx,
        actor.workspaceId,
        'knowledge-index',
        revision.id,
        actor.requestId,
      );
      const row = await tx.knowledgeDocument.update({
        where: { id },
        data: { status: 'PUBLISHED', publishedVersion: doc.version },
      });
      await writeAudit(tx, actor, {
        entityType: 'knowledge',
        entityId: id,
        eventType: 'knowledge.published',
        metadata: { version: doc.version },
      });
      return row;
    });
  }
  archive(
    actor: WorkspaceActor,
    id: string,
    input: z.input<typeof versionSchema>,
  ) {
    const data = parseContract(versionSchema, input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, admins);
      const doc = await requireDocument(tx, actor.workspaceId, id);
      if (doc.version !== data.expectedVersion)
        throw new AppException('INVALID_STATE_TRANSITION');
      const row = await tx.knowledgeDocument.update({
        where: { id },
        data: { status: 'ARCHIVED' },
      });
      await writeAudit(tx, actor, {
        entityType: 'knowledge',
        entityId: id,
        eventType: 'knowledge.archived',
      });
      return row;
    });
  }
  reindex(
    actor: WorkspaceActor,
    id: string,
    input: z.input<typeof versionSchema>,
  ) {
    this.provider.metadata();
    const data = parseContract(versionSchema, input);
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, admins);
      const doc = await requireDocument(tx, actor.workspaceId, id);
      if (
        doc.version !== data.expectedVersion ||
        doc.status !== 'PUBLISHED' ||
        !doc.publishedVersion
      )
        throw new AppException('INVALID_STATE_TRANSITION');
      const revision = await tx.knowledgeRevision.findUniqueOrThrow({
        where: {
          workspaceId_documentId_version: {
            workspaceId: actor.workspaceId,
            documentId: id,
            version: doc.publishedVersion,
          },
        },
      });
      await tx.knowledgeRevision.update({
        where: { id: revision.id },
        data: { indexStatus: 'PENDING', failureCode: null },
      });
      await enqueueJob(
        tx,
        actor.workspaceId,
        'knowledge-index',
        revision.id,
        actor.requestId,
      );
      return {
        documentId: id,
        version: revision.version,
        indexStatus: 'PENDING',
      };
    });
  }
  async preview(actor: WorkspaceActor, query: string, topK: number) {
    await this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, [
        WorkspaceRole.ADMIN,
        WorkspaceRole.AGENT,
      ]);
    });
    const sources = await this.search(
      actor.workspaceId,
      query,
      topK,
      AbortSignal.timeout(60000),
    );
    return this.uow.runAs(actor, async (tx) => {
      await assertWorkspaceActor(tx, actor, [
        WorkspaceRole.ADMIN,
        WorkspaceRole.AGENT,
      ]);
      return sources;
    });
  }
  /** Internal server scope; model input cannot select workspaceId. */
  async search(
    workspaceId: string,
    query: string,
    topK: number,
    signal: AbortSignal,
  ): Promise<EvidenceSource[]> {
    if (
      !z.uuid().safeParse(workspaceId).success ||
      !query.trim() ||
      query.length > 2000 ||
      !Number.isInteger(topK) ||
      topK < 1 ||
      topK > 20
    )
      throw new AppException('VALIDATION_ERROR');
    const model = this.provider.metadata().embeddingModel;
    const vector = JSON.stringify(
      validateEmbedding(await this.provider.embed(query, 'query', signal)),
    );
    const rows = await this.uow.run(
      (tx) => tx.$queryRaw<
        Array<{
          id: string;
          documentId: string;
          documentVersion: number;
          title: string;
          content: string;
          contentHash: string;
          score: number;
        }>
      >`
    SELECT c.id,c."documentId",c."documentVersion",r.title,c.content,c."contentHash",1-(c.embedding OPERATOR(extensions.<=>) ${vector}::extensions.vector) AS score
    FROM handled."KnowledgeChunk" c JOIN handled."KnowledgeDocument" d ON d.id=c."documentId" AND d."workspaceId"=c."workspaceId"
    JOIN handled."KnowledgeRevision" r ON r."workspaceId"=c."workspaceId" AND r."documentId"=c."documentId" AND r.version=c."documentVersion"
    JOIN handled."Workspace" w ON w.id=c."workspaceId"
    WHERE c."workspaceId"=${workspaceId}::uuid AND w.status='ACTIVE' AND d.status='PUBLISHED' AND d."publishedVersion"=c."documentVersion" AND r."indexStatus"='READY' AND r."embeddingModel"=${model} AND c."embeddingModel"=${model}
    ORDER BY c.embedding OPERATOR(extensions.<=>) ${vector}::extensions.vector,c.id LIMIT ${topK}`,
    );
    return rows
      .filter((r) => r.score >= 0.5)
      .map((r) => ({
        sourceType: 'KNOWLEDGE',
        sourceRefId: `kb-${r.id}`,
        documentId: r.documentId,
        documentVersion: r.documentVersion,
        chunkId: r.id,
        title: r.title,
        excerpt: r.content,
        contentHash: r.contentHash,
        observedAt: new Date().toISOString(),
        score: Math.max(-1, Math.min(1, r.score)),
      }));
  }
}
