import {
  ActionType,
  Confidence,
} from '../../../common/contracts/domain.enums.js';
import { proposalOutputSchema } from '../../ai/contracts/proposal-output.schema.js';
import { recommendationSchema } from './recommendation.schema.js';

const refund = {
  type: ActionType.REFUND_DUPLICATE_PAYMENT,
  targetRef: 'PAY-9002',
  params: { amountMinor: 2900, currency: 'USD' },
};
const proposal = {
  category: 'BILLING_DUPLICATE_CHARGE',
  summary: 'Two settled charges for the same billing period',
  confidence: Confidence.HIGH,
  missingFacts: [],
  recommendation: refund,
  replyDraft: 'An agent will review the duplicate charge.',
  evidenceRefs: ['PAY-9001', 'PAY-9002', 'KB-REFUND-v1#2'],
};

describe('recommendation boundary', () => {
  it.each(Object.values(ActionType))(
    'admits only the defined payload for %s',
    (type) => {
      const value =
        type === ActionType.REFUND_DUPLICATE_PAYMENT
          ? refund
          : { type, targetRef: 'target', params: {} };
      expect(recommendationSchema.parse(value)).toEqual(value);
    },
  );

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '2900', Infinity, NaN])(
    'rejects an invalid minor-unit amount: %s',
    (amountMinor) => {
      expect(
        recommendationSchema.safeParse({
          ...refund,
          params: { amountMinor, currency: 'USD' },
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    { ...refund, type: 'TRANSFER_MONEY' },
    { ...refund, workspaceId: 'another-tenant' },
    { ...refund, approved: true },
    { ...refund, targetRef: '   ' },
    { ...refund, params: { amountMinor: 2900, currency: 'usd' } },
    {
      ...refund,
      params: { amountMinor: 2900, currency: 'USD', adminOverride: true },
    },
    {
      type: ActionType.CANCEL_AT_PERIOD_END,
      targetRef: 'SUB-1002',
      params: { currentPeriodEnd: '2099-01-01' },
    },
    {
      type: ActionType.RESTORE_PRODUCT_ACCESS,
      targetRef: 'access',
      params: { productId: 'another-product' },
    },
  ])('rejects privilege or payload expansion %#', (value) => {
    expect(recommendationSchema.safeParse(value).success).toBe(false);
  });
});

describe('structured proposal boundary', () => {
  it('accepts the documented duplicate-charge example without changing evidence', () => {
    expect(proposalOutputSchema.parse(proposal)).toEqual(proposal);
  });

  it('keeps validated evidence, missing facts and action parameters immutable', () => {
    const parsed = proposalOutputSchema.parse(proposal);
    expect(Reflect.set(parsed.evidenceRefs, 0, 'forged-source')).toBe(false);
    expect(Reflect.set(parsed.missingFacts, 0, 'forged-fact')).toBe(false);
    expect(Reflect.set(parsed.recommendation!.params, 'override', true)).toBe(
      false,
    );
    expect(parsed.evidenceRefs).toEqual(proposal.evidenceRefs);
  });

  it('supports safe manual review without forcing an invented action or evidence', () => {
    expect(
      proposalOutputSchema.parse({
        ...proposal,
        confidence: Confidence.LOW,
        recommendation: null,
        evidenceRefs: [],
        missingFacts: ['Policy is unavailable'],
      }).recommendation,
    ).toBeNull();
  });

  it.each([
    { ...proposal, confidence: 'CERTAIN' },
    { ...proposal, missingFacts: ['Unknown policy'] },
    { ...proposal, recommendation: null },
    { ...proposal, evidenceRefs: [] },
    { ...proposal, evidenceRefs: ['PAY-9001', 'PAY-9001'] },
    { ...proposal, replyDraft: '  ' },
    { ...proposal, actorUserId: 'model-chosen-actor' },
    { ...proposal, status: 'APPROVED' },
  ])('rejects unsafe or inconsistent model output %#', (value) => {
    expect(proposalOutputSchema.safeParse(value).success).toBe(false);
  });
});
