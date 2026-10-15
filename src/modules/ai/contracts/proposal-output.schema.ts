import { z } from 'zod';
import {
  Confidence,
  TicketPriority,
} from '../../../common/contracts/domain.enums.js';
import { recommendationSchema } from '../../proposal/contracts/recommendation.schema.js';
import {
  ContractLimit,
  referenceSchema,
  textSchema,
} from './contract-primitives.js';

// Category taxonomy is owned/reviewed with B. Do not invent a competing Ticket enum.
export const categorySchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Z][A-Z0-9_]*$/);

export const classificationSchema = z
  .strictObject({
    category: categorySchema,
    priority: z.enum(TicketPriority),
    confidence: z.enum(Confidence),
    missingFacts: z
      .array(textSchema(ContractLimit.FACT))
      .max(ContractLimit.FACTS)
      .readonly(),
  })
  .readonly();

export const proposalOutputSchema = z
  .strictObject({
    category: categorySchema,
    summary: textSchema(ContractLimit.SUMMARY),
    confidence: z.enum(Confidence),
    missingFacts: z
      .array(textSchema(ContractLimit.FACT))
      .max(ContractLimit.FACTS)
      .readonly(),
    recommendation: recommendationSchema.nullable(),
    replyDraft: textSchema(ContractLimit.REPLY),
    evidenceRefs: z
      .array(referenceSchema)
      .max(ContractLimit.SOURCES)
      .readonly(),
  })
  .superRefine((proposal, context) => {
    if (
      proposal.confidence === Confidence.HIGH &&
      proposal.missingFacts.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['confidence'],
        message: 'HIGH confidence cannot have missing facts',
      });
    }
    if (
      proposal.confidence !== Confidence.LOW &&
      proposal.recommendation === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['recommendation'],
        message: 'No recommendation requires LOW confidence and manual review',
      });
    }
    if (
      proposal.recommendation !== null &&
      proposal.evidenceRefs.length === 0
    ) {
      context.addIssue({
        code: 'custom',
        path: ['evidenceRefs'],
        message: 'A recommendation needs evidence references',
      });
    }
    if (new Set(proposal.evidenceRefs).size !== proposal.evidenceRefs.length) {
      context.addIssue({
        code: 'custom',
        path: ['evidenceRefs'],
        message: 'Evidence references must be unique',
      });
    }
  })
  .readonly();

export type Classification = z.infer<typeof classificationSchema>;
export type ProposalOutput = z.infer<typeof proposalOutputSchema>;
