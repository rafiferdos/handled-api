import {
  verifyBusinessEffect,
  verifyReadyProposal,
} from './hosted-acceptance.js';

const action = {
  simulation: true,
  status: 'SUCCEEDED',
  type: 'REFUND_DUPLICATE_PAYMENT',
  targetRef: 'PAY-9002',
  beforeState: { id: 'payment-id', status: 'SETTLED' },
  afterState: { id: 'payment-id', status: 'REFUNDED' },
};

it('requires an actual persisted simulated effect, not a successful receipt alone', () => {
  expect(() =>
    verifyBusinessEffect(action, {
      payments: [{ id: 'payment-id', status: 'REFUNDED' }],
    }),
  ).not.toThrow();
  expect(() =>
    verifyBusinessEffect(action, {
      payments: [{ id: 'payment-id', status: 'SETTLED' }],
    }),
  ).toThrow('Persisted refund');
  expect(() =>
    verifyBusinessEffect({ ...action, simulation: false }, { payments: [] }),
  ).toThrow('simulated');
  expect(() =>
    verifyBusinessEffect({ ...action, afterState: null }, { payments: [] }),
  ).toThrow();
});

it('requires policy and account citations plus the requested real recommendation', () => {
  const proposal = {
    status: 'READY',
    confidence: 'HIGH',
    recommendation: { type: 'REFUND_DUPLICATE_PAYMENT' },
    sources: [
      { sourceType: 'KNOWLEDGE', sourceRefId: 'kb-policy' },
      { sourceType: 'TOOL', sourceRefId: 'customer-fact' },
    ],
    evidenceRefs: ['kb-policy', 'customer-fact'],
  };
  expect(() =>
    verifyReadyProposal(proposal, 'REFUND_DUPLICATE_PAYMENT'),
  ).not.toThrow();
  expect(() =>
    verifyReadyProposal(
      { ...proposal, sources: proposal.sources.slice(1) },
      'REFUND_DUPLICATE_PAYMENT',
    ),
  ).toThrow('policy');
  expect(() =>
    verifyReadyProposal(
      { ...proposal, evidenceRefs: ['kb-policy'] },
      'REFUND_DUPLICATE_PAYMENT',
    ),
  ).toThrow('account');
  expect(() =>
    verifyReadyProposal(
      { ...proposal, confidence: 'LOW' },
      'REFUND_DUPLICATE_PAYMENT',
    ),
  ).toThrow('eligible');
});
