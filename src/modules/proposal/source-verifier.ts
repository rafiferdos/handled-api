import type { Prisma } from '../../generated/prisma/client.js';
import { AppException } from '../../common/errors/app.exception.js';
import { canonicalJson, sha256 } from '../../common/database/json.js';
import { customerSelect } from '../customer/customer.service.js';
import {
  paymentSelect,
  paymentProjection,
  subscriptionSelect,
  subscriptionProjection,
  accessSelect,
  accessProjection,
} from '../billing/account-projections.js';
import type { EvidenceSource } from './contracts/evidence.schema.js';
export async function verifySources(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  customerId: string,
  sources: readonly EvidenceSource[],
) {
  if (sources.length > 50) throw new AppException('BUSINESS_RULE_FAILED');
  for (const source of sources) {
    if (source.sourceType === 'KNOWLEDGE') {
      const rows = await tx.$queryRaw<
        Array<{ content: string; contentHash: string }>
      >`
    SELECT c.content,c."contentHash" FROM handled."KnowledgeChunk" c
    JOIN handled."KnowledgeDocument" d ON d.id=c."documentId" AND d."workspaceId"=c."workspaceId"
    JOIN handled."KnowledgeRevision" r ON r."workspaceId"=c."workspaceId" AND r."documentId"=c."documentId" AND r.version=c."documentVersion"
    WHERE c.id=${source.chunkId}::uuid AND c."workspaceId"=${workspaceId}::uuid AND c."documentId"=${source.documentId}::uuid AND c."documentVersion"=${source.documentVersion}
      AND d.status='PUBLISHED' AND d."publishedVersion"=c."documentVersion" AND r."indexStatus"='READY' AND r."embeddingModel"=c."embeddingModel"`;
      if (
        source.sourceRefId !== `kb-${source.chunkId}` ||
        !rows[0] ||
        rows[0].contentHash !== source.contentHash ||
        rows[0].content !== source.excerpt
      )
        throw new AppException('BUSINESS_RULE_FAILED');
      continue;
    }
    const match =
      /^(customer|payment|subscription|access)-([0-9a-f-]{36})$/.exec(
        source.sourceRefId,
      );
    if (!match) throw new AppException('BUSINESS_RULE_FAILED');
    const [, kind, id] = match;
    let data: Prisma.InputJsonValue | null = null;
    if (kind === 'customer' && id === customerId)
      data = await tx.customer.findUnique({
        where: { workspaceId_id: { workspaceId, id } },
        select: customerSelect,
      });
    if (kind === 'payment') {
      const row = await tx.payment.findFirst({
        where: { workspaceId, id, customerId },
        select: paymentSelect,
      });
      if (row) data = paymentProjection(row);
    }
    if (kind === 'subscription') {
      const row = await tx.subscription.findFirst({
        where: { workspaceId, id, customerId },
        select: subscriptionSelect,
      });
      if (row) data = subscriptionProjection(row);
    }
    if (kind === 'access') {
      const row = await tx.productAccess.findFirst({
        where: { workspaceId, id, customerId },
        select: accessSelect,
      });
      if (row) data = accessProjection(row);
    }
    if (
      data === null ||
      sha256(canonicalJson(data)) !== source.contentHash ||
      canonicalJson(data) !== source.excerpt
    )
      throw new AppException('BUSINESS_RULE_FAILED');
  }
}
