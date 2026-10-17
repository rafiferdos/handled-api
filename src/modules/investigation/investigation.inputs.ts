import { z } from 'zod';
import {
  InvestigationStatus,
  InvestigationStepStatus,
  InvestigationStepType,
} from '../../generated/prisma/enums.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { classificationSchema } from '../ai/contracts/proposal-output.schema.js';
import {
  referenceSchema,
  textSchema,
} from '../ai/contracts/contract-primitives.js';
const integer = z.number().int().min(1).max(2147483647);
export const runInputSchema = z.strictObject({
  provider: textSchema(100),
  model: textSchema(100),
  promptVersion: textSchema(100),
  parentRunId: z.uuid().optional(),
});
export type RunInput = z.input<typeof runInputSchema>;
export const runTransitionSchema = z
  .strictObject({
    expectedVersion: integer,
    status: z.enum(InvestigationStatus),
    classification: classificationSchema.optional(),
    failureCode: z.enum(ErrorCode).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.status === 'FAILED') !== (v.failureCode !== undefined))
      ctx.addIssue({
        code: 'custom',
        path: ['failureCode'],
        message: 'Failure code belongs only to failed runs',
      });
  });
export type RunTransition = z.input<typeof runTransitionSchema>;
export const stepInputSchema = z
  .strictObject({
    sequence: integer,
    type: z.enum(InvestigationStepType),
    label: textSchema(256),
    status: z.enum(InvestigationStepStatus),
    toolName: textSchema(100).optional(),
    sourceRefs: z.array(referenceSchema).max(50).default([]),
    durationMs: z.number().int().min(0).max(2147483647).optional(),
    errorCode: z.enum(ErrorCode).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.type === 'TOOL') !== (v.toolName !== undefined))
      ctx.addIssue({
        code: 'custom',
        path: ['toolName'],
        message: 'Tool steps require a tool name only',
      });
    if ((v.status === 'FAILED') !== (v.errorCode !== undefined))
      ctx.addIssue({
        code: 'custom',
        path: ['errorCode'],
        message: 'Failed steps require an error code only',
      });
  });
export type StepInput = z.input<typeof stepInputSchema>;
export const finishStepSchema = z
  .strictObject({
    status: z.enum(['COMPLETED', 'FAILED']),
    sourceRefs: z.array(referenceSchema).max(50).default([]),
    durationMs: z.number().int().min(0).max(2147483647),
    errorCode: z.enum(ErrorCode).optional(),
  })
  .superRefine((v, ctx) => {
    if ((v.status === 'FAILED') !== (v.errorCode !== undefined))
      ctx.addIssue({
        code: 'custom',
        path: ['errorCode'],
        message: 'Failed steps require an error code only',
      });
  });
export type FinishStepInput = z.input<typeof finishStepSchema>;
