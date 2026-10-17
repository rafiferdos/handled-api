import { sha256 } from '../../common/database/json.js';
import { toolSource } from '../ai/read-tools.js';
import type { EvaluationCase } from './evaluation-cases.js';
import type { EvidenceSource } from '../proposal/contracts/evidence.schema.js';
export const evaluationPolicies = [
  {
    kind: 'refund',
    id: '00000000-0000-4000-8000-000000000101',
    text: 'Refund an eligible duplicate only: two SETTLED payments for the same verified customer, subscription, billing period, amount and currency. Never refund an already refunded payment. Human approval is required.',
  },
  {
    kind: 'cancel',
    id: '00000000-0000-4000-8000-000000000102',
    text: 'Cancel renewal at period end for an active current subscription not already scheduled for cancellation. Preserve currentPeriodEnd and paid product access. Human approval is required.',
  },
  {
    kind: 'restore',
    id: '00000000-0000-4000-8000-000000000103',
    text: 'Restore revoked product access only for a verified customer with a current active subscription and a settled current-period payment for that exact subscription and product. Human approval is required.',
  },
] as const;
export function evaluationFixture(c: EvaluationCase) {
  const has = (condition: string) => c.conditions.includes(condition);
  const customer = {
    id: '00000000-0000-4000-8000-000000000001',
    externalRef: 'CUS-1001',
    name: 'Synthetic evaluation customer',
    email: 'synthetic@example.invalid',
    status: has('blocked-customer') ? 'BLOCKED' : 'ACTIVE',
    version: 1,
  };
  const subscription = {
    id: '00000000-0000-4000-8000-000000000002',
    externalRef: 'SUB-1001',
    planCode: 'PRO',
    productCode: 'APP',
    status: 'ACTIVE',
    currentPeriodStart: '2026-10-01T00:00:00.000Z',
    currentPeriodEnd: has('expired-subscription')
      ? '2026-10-10T00:00:00.000Z'
      : '2026-10-31T23:59:59.000Z',
    cancelAtPeriodEnd: has('already-cancelled'),
    version: 1,
  };
  const payment = {
    id: '00000000-0000-4000-8000-000000000003',
    externalRef: 'PAY-9001',
    subscriptionId: subscription.id,
    billingPeriodKey: '2026-10',
    amountMinor: 2900,
    currency: 'USD',
    status: has('unsettled-payment') ? 'PENDING' : 'SETTLED',
    paidAt: '2026-10-02T00:00:00.000Z',
    refundedAt: null,
    version: 1,
  };
  const duplicate = {
    ...payment,
    id: '00000000-0000-4000-8000-000000000004',
    externalRef: 'PAY-9002',
    amountMinor: has('amount-mismatch') ? 1900 : 2900,
    currency: has('currency-mismatch') ? 'EUR' : 'USD',
    billingPeriodKey: has('period-mismatch') ? '2026-09' : '2026-10',
    status: has('already-refunded')
      ? 'REFUNDED'
      : has('pending-payment')
        ? 'PENDING'
        : payment.status,
  };
  const access = {
    id: '00000000-0000-4000-8000-000000000005',
    productCode: has('wrong-product') ? 'OTHER' : 'APP',
    status: has('access-active') ? 'ACTIVE' : 'REVOKED',
    reason: 'SYNC_ERROR',
    lastSyncedAt: null,
    version: 1,
  };
  const payments =
    has('no-duplicate') || has('customer-mismatch')
      ? [payment]
      : [payment, duplicate];
  const sources: EvidenceSource[] = [
    toolSource('customer', customer.id, customer),
    toolSource('subscription', subscription.id, subscription),
    toolSource('access', access.id, access),
    ...payments.map((p) => toolSource('payment', p.id, p)),
  ];
  return {
    customerId: customer.id,
    asOf: '2026-10-17T00:00:00.000Z',
    customerVerified: !has('unverified-customer'),
    customer,
    subscription,
    payments,
    access,
    sources,
    conflictingPolicy: has('conflicting-policy'),
    missingPolicy: has('missing-policy'),
    untrustedInjection: has('untrusted-injection'),
  };
}
export function evaluationPolicySource(
  policy: (typeof evaluationPolicies)[number],
  score: number,
): EvidenceSource {
  return {
    sourceType: 'KNOWLEDGE',
    sourceRefId: `kb-${policy.id}`,
    documentId: policy.id,
    documentVersion: 1,
    chunkId: policy.id,
    title: `Synthetic ${policy.kind} policy`,
    excerpt: policy.text,
    contentHash: sha256(policy.text),
    observedAt: '2026-10-17T00:00:00.000Z',
    score,
  };
}
