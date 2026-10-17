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
