import { z } from 'zod';
import {
  ContractLimit,
  contentHashSchema,
  positiveIntegerSchema,
  referenceSchema,
  resourceIdSchema,
  textSchema,
  timestampSchema,
} from '../../ai/contracts/contract-primitives.js';

export const SourceType = { TOOL: 'TOOL', KNOWLEDGE: 'KNOWLEDGE' } as const;

const snapshot = {
  sourceRefId: referenceSchema,
  title: textSchema(256),
  excerpt: textSchema(ContractLimit.EXCERPT),
  contentHash: contentHashSchema,
  observedAt: timestampSchema,
};

// A generic source ref is not a fictitious FK to multiple owner tables.
export const evidenceSourceSchema = z
  .discriminatedUnion('sourceType', [
    z.strictObject({ sourceType: z.literal(SourceType.TOOL), ...snapshot }),
    z.strictObject({
      sourceType: z.literal(SourceType.KNOWLEDGE),
      ...snapshot,
      documentId: resourceIdSchema,
      documentVersion: positiveIntegerSchema,
      chunkId: resourceIdSchema,
      score: z.number().min(-1).max(1).nullable(),
    }),
  ])
  .readonly();

export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
