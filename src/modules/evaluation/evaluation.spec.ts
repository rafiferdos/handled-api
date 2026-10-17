import { evaluationCases } from './evaluation-cases.js';
import { scoreEvaluation } from './evaluation-scoring.js';
import { EvaluationRunner } from './evaluation-runner.js';
import { FixtureProvider } from '../../../test/database/provider.js';
import { Confidence } from '../../common/contracts/domain.enums.js';
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
it('reports observed provider usage and retains completed stages when a later call fails', async () => {
  const provider = new FixtureProvider();
  provider.output = {
    category: 'OTHER',
    summary: 'A human must review the synthetic request.',
    confidence: Confidence.LOW,
    missingFacts: ['No trusted resolution is available'],
    recommendation: null,
    replyDraft: 'A human will review this request.',
    evidenceRefs: [],
  };
  let calls = 0;
  provider.beforeRecommend = () => {
    if (++calls === 2) throw new Error('Private provider failure');
    return Promise.resolve();
  };
  const result = await new EvaluationRunner(provider).run();
  expect(result.results[0]).toMatchObject({
    usage: {
      classification: { inputTokens: 10, outputTokens: 10 },
      tools: { inputTokens: 10, outputTokens: 10 },
      recommendation: { inputTokens: 10, outputTokens: 10 },
      reply: { inputTokens: 10, outputTokens: 10 },
    },
  });
  expect(result.results[1]).toMatchObject({
    passed: false,
    errorCode: 'AI_PROVIDER_ERROR',
    usage: {
      classification: { inputTokens: 10, outputTokens: 10 },
      tools: { inputTokens: 10, outputTokens: 10 },
    },
  });
  expect(JSON.stringify(result)).not.toContain('Private provider failure');
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
