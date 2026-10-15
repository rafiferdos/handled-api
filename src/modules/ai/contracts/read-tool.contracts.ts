import { z } from 'zod';
import type { JobContext } from '../../../common/contracts/async.contracts.js';
import { evidenceSourceSchema } from '../../proposal/contracts/evidence.schema.js';
import type { EvidenceSource } from '../../proposal/contracts/evidence.schema.js';
import {
  ContractLimit,
  resourceIdSchema,
  textSchema,
  timestampSchema,
} from './contract-primitives.js';

const customerArgumentsSchema = z.strictObject({
  customerId: resourceIdSchema,
});
const paymentArgumentsSchema = customerArgumentsSchema
  .extend({
    from: timestampSchema.optional(),
    to: timestampSchema.optional(),
  })
  .superRefine((args, context) => {
    if (args.from && args.to && Date.parse(args.from) > Date.parse(args.to)) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Range end must not precede its start',
      });
    }
  });

export const readToolArgumentSchemas = {
  getCustomerProfile: customerArgumentsSchema,
  listCustomerPayments: paymentArgumentsSchema,
  getActiveSubscription: customerArgumentsSchema,
  getProductAccess: customerArgumentsSchema,
  searchKnowledge: z.strictObject({
    query: textSchema(ContractLimit.TOOL_QUERY),
    topK: z.number().int().min(1).max(ContractLimit.TOP_K).default(5),
  }),
} as const;

export type ReadToolName = keyof typeof readToolArgumentSchemas;
export type ReadToolArguments<TName extends ReadToolName> = z.output<
  (typeof readToolArgumentSchemas)[TName]
>;

export const readToolCallSchema = z.discriminatedUnion('name', [
  z.strictObject({
    name: z.literal('getCustomerProfile'),
    arguments: readToolArgumentSchemas.getCustomerProfile,
  }),
  z.strictObject({
    name: z.literal('listCustomerPayments'),
    arguments: readToolArgumentSchemas.listCustomerPayments,
  }),
  z.strictObject({
    name: z.literal('getActiveSubscription'),
    arguments: readToolArgumentSchemas.getActiveSubscription,
  }),
  z.strictObject({
    name: z.literal('getProductAccess'),
    arguments: readToolArgumentSchemas.getProductAccess,
  }),
  z.strictObject({
    name: z.literal('searchKnowledge'),
    arguments: readToolArgumentSchemas.searchKnowledge,
  }),
]);
export type ReadToolCall = z.infer<typeof readToolCallSchema>;

// Server-resolved scope, supplied separately from model-controlled arguments.
// Implementations must check both workspace and ticket/customer equality on each call.
export interface ReadToolContext extends Readonly<JobContext> {
  readonly ticketId: string;
  readonly customerId: string;
}

export interface ReadToolResult<TData> {
  readonly data: TData | null;
  readonly sources: readonly EvidenceSource[];
  readonly missingFacts: readonly string[];
}

// Producer DTOs are not invented here. B/C provide reviewed projections and the
// adapter validates them with its concrete data schema before the model sees them.
export function readToolResultSchema<TSchema extends z.ZodType>(
  dataSchema: TSchema,
) {
  return z
    .strictObject({
      data: dataSchema.nullable(),
      sources: z
        .array(evidenceSourceSchema)
        .max(ContractLimit.SOURCES)
        .readonly(),
      missingFacts: z
        .array(textSchema(ContractLimit.FACT))
        .max(ContractLimit.FACTS)
        .readonly(),
    })
    .readonly();
}

export interface ReadTool<TName extends ReadToolName, TData> {
  readonly name: TName;
  readonly resultSchema: z.ZodType<ReadToolResult<TData>>;
  execute(
    context: ReadToolContext,
    arguments_: ReadToolArguments<TName>,
  ): Promise<ReadToolResult<TData>>;
}
