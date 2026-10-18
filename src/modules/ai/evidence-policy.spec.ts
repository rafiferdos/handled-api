import { validateProposalEvidence } from './evidence-policy.js';
import { proposalOutputSchema } from './contracts/proposal-output.schema.js';
import type { EvidenceSource } from '../proposal/contracts/evidence.schema.js';
const output = proposalOutputSchema.parse({
  category: 'BILLING_DUPLICATE_CHARGE',
  summary: 'A duplicate payment exists',
  confidence: 'HIGH',
  missingFacts: [],
  recommendation: {
    type: 'REFUND_DUPLICATE_PAYMENT',
    targetRef: 'PAY-2',
    params: { amountMinor: 2900, currency: 'USD' },
  },
  replyDraft: 'Proposed refund for review',
  evidenceRefs: ['PAY-2'],
});
it('rejects model-invented citations rather than storing apparently actionable output', () => {
  expect(() => validateProposalEvidence(output, [], [])).toThrow();
});
it('downgrades missing critical policy or tool facts to LOW without a recommendation', () => {
  const source = {
    sourceType: 'TOOL' as const,
    sourceRefId: 'PAY-2',
    title: 'Payment',
    excerpt: 'Settled payment',
    contentHash: 'a'.repeat(64),
    observedAt: new Date().toISOString(),
  };
  const safe = validateProposalEvidence(
    output,
    [source],
    ['No published refund policy'],
  );
  expect(safe).toMatchObject({ confidence: 'LOW', recommendation: null });
  expect(safe.missingFacts).toContain('No published refund policy');
});

it('requires the verified customer citation even when policy and payment citations exist', () => {
  const payment: EvidenceSource = {
    sourceType: 'TOOL',
    sourceRefId: 'payment-record',
    title: 'Payment',
    excerpt: 'Verified settled payment',
    contentHash: 'a'.repeat(64),
    observedAt: new Date().toISOString(),
  };
  const customer: EvidenceSource = {
    ...payment,
    sourceRefId: 'customer-verified-id',
    title: 'Customer',
  };
  const policy: EvidenceSource = {
    ...payment,
    sourceType: 'KNOWLEDGE',
    sourceRefId: 'kb-policy',
    documentId: '00112233-4455-4677-8899-aabbccddeeff',
    documentVersion: 1,
    chunkId: '10112233-4455-4677-8899-aabbccddeeff',
    score: 0.9,
  };
  const candidate = {
    ...output,
    evidenceRefs: ['payment-record', 'kb-policy'],
  };
  const uncited = validateProposalEvidence(
    candidate,
    [payment, customer, policy],
    [],
  );
  expect(uncited).toMatchObject({ confidence: 'LOW', recommendation: null });
  expect(uncited.missingFacts).toContain(
    'Missing verified customer identity evidence',
  );
  expect(
    validateProposalEvidence(
      {
        ...candidate,
        evidenceRefs: [...candidate.evidenceRefs, customer.sourceRefId],
      },
      [payment, customer, policy],
      [],
    ),
  ).toMatchObject({
    confidence: 'HIGH',
    recommendation: output.recommendation,
  });
});
