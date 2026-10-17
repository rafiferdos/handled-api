import { validateProposalEvidence } from './evidence-policy.js';
import { proposalOutputSchema } from './contracts/proposal-output.schema.js';
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
