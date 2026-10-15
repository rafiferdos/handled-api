import { z } from 'zod';
import { ActionType } from '../../../common/contracts/domain.enums.js';
import {
  positiveIntegerSchema,
  referenceSchema,
} from '../../ai/contracts/contract-primitives.js';

export const refundParamsSchema = z
  .strictObject({
    amountMinor: positiveIntegerSchema,
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .describe(
        'Uppercase currency code; server verifies against the target payment',
      ),
  })
  .readonly();

// Cancel keeps the existing period end; restore derives eligibility server-side.
// Neither action accepts AI-supplied dates, flags, products or arbitrary patches.
export const emptyActionParamsSchema = z.strictObject({}).readonly();

export const recommendationSchema = z
  .discriminatedUnion('type', [
    z.strictObject({
      type: z.literal(ActionType.REFUND_DUPLICATE_PAYMENT),
      targetRef: referenceSchema,
      params: refundParamsSchema,
    }),
    z.strictObject({
      type: z.literal(ActionType.CANCEL_AT_PERIOD_END),
      targetRef: referenceSchema,
      params: emptyActionParamsSchema,
    }),
    z.strictObject({
      type: z.literal(ActionType.RESTORE_PRODUCT_ACCESS),
      targetRef: referenceSchema,
      params: emptyActionParamsSchema,
    }),
  ])
  .readonly();

export type Recommendation = z.infer<typeof recommendationSchema>;
export type RefundRecommendation = Extract<
  Recommendation,
  { type: ActionType.REFUND_DUPLICATE_PAYMENT }
>;
