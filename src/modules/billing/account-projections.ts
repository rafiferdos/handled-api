import { z } from 'zod';
import {
  PaymentStatus,
  SubscriptionStatus,
  ProductAccessStatus,
} from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
export const ACCOUNT_CONTEXT_LIMIT = 50;
export const paymentSelect = {
  id: true,
  externalRef: true,
  subscriptionId: true,
  billingPeriodKey: true,
  amountMinor: true,
  currency: true,
  status: true,
  paidAt: true,
  refundedAt: true,
  version: true,
} satisfies Prisma.PaymentSelect;
export const subscriptionSelect = {
  id: true,
  externalRef: true,
  planCode: true,
  productCode: true,
  status: true,
  currentPeriodStart: true,
  currentPeriodEnd: true,
  cancelAtPeriodEnd: true,
  version: true,
} satisfies Prisma.SubscriptionSelect;
export const accessSelect = {
  id: true,
  productCode: true,
  status: true,
  reason: true,
  lastSyncedAt: true,
  version: true,
} satisfies Prisma.ProductAccessSelect;
export const paymentProjection = (
  r: Prisma.PaymentGetPayload<{ select: typeof paymentSelect }>,
) => ({
  ...r,
  paidAt: r.paidAt?.toISOString() ?? null,
  refundedAt: r.refundedAt?.toISOString() ?? null,
});
export const subscriptionProjection = (
  r: Prisma.SubscriptionGetPayload<{ select: typeof subscriptionSelect }>,
) => ({
  ...r,
  currentPeriodStart: r.currentPeriodStart.toISOString(),
  currentPeriodEnd: r.currentPeriodEnd.toISOString(),
});
export const accessProjection = (
  r: Prisma.ProductAccessGetPayload<{ select: typeof accessSelect }>,
) => ({ ...r, lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null });

// Concrete producer contracts for the later read-tool adapter and OpenAPI.
export const paymentProjectionSchema = z.strictObject({
  id: z.uuid(),
  externalRef: z.string(),
  subscriptionId: z.uuid().nullable(),
  billingPeriodKey: z.string(),
  amountMinor: z.number().int().min(0).max(2147483647),
  currency: z.string().regex(/^[A-Z]{3}$/),
  status: z.enum(PaymentStatus),
  paidAt: z.iso.datetime().nullable(),
  refundedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
});
export const subscriptionProjectionSchema = z.strictObject({
  id: z.uuid(),
  externalRef: z.string(),
  planCode: z.string(),
  productCode: z.string(),
  status: z.enum(SubscriptionStatus),
  currentPeriodStart: z.iso.datetime(),
  currentPeriodEnd: z.iso.datetime(),
  cancelAtPeriodEnd: z.boolean(),
  version: z.number().int().positive(),
});
export const accessProjectionSchema = z.strictObject({
  id: z.uuid(),
  productCode: z.string(),
  status: z.enum(ProductAccessStatus),
  reason: z.string().nullable(),
  lastSyncedAt: z.iso.datetime().nullable(),
  version: z.number().int().positive(),
});
