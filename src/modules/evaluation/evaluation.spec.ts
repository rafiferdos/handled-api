import { evaluationCases } from './evaluation-cases.js';
import { scoreEvaluation } from './evaluation-scoring.js';
it('covers three golden paths and at least ten distinct safe-failure scenarios', () => {
  expect(evaluationCases.length).toBeGreaterThanOrEqual(20);
  expect(new Set(evaluationCases.map((c) => c.id)).size).toBe(
    evaluationCases.length,
  );
  expect(
    evaluationCases.filter((c) => c.mustReview).length,
  ).toBeGreaterThanOrEqual(10);
  expect(
    evaluationCases
      .filter((c) => c.id.startsWith('golden-'))
      .map((c) => c.expectedAction),
  ).toEqual([
    'REFUND_DUPLICATE_PAYMENT',
    'CANCEL_AT_PERIOD_END',
    'RESTORE_PRODUCT_ACCESS',
  ]);
});
it('scores expected escalation independently from a schema-valid incorrect action', () => {
  const expected = evaluationCases.find(
    (c) => c.id === 'negative-missing-policy',
  )!;
  const result = scoreEvaluation(expected, {
    category: 'BILLING_DUPLICATE_CHARGE',
    recommendationType: 'REFUND_DUPLICATE_PAYMENT',
    confidence: 'HIGH',
    sourcesResolved: true,
    toolsScoped: true,
    replyGrounded: true,
    retrievalMatched: false,
  });
  expect(result.actionCorrect).toBe(false);
  expect(result.reviewCorrect).toBe(false);
  expect(result.passed).toBe(false);
});
