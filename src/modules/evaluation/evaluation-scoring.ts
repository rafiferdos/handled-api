import type { EvaluationCase } from './evaluation-cases.js';
export interface EvaluationObservation {
  category: string;
  recommendationType: string | null;
  confidence: string;
  sourcesResolved: boolean;
  toolsScoped: boolean;
  replyGrounded: boolean;
  retrievalMatched: boolean;
}
export function scoreEvaluation(
  expected: EvaluationCase,
  actual: EvaluationObservation,
) {
  const classificationCorrect = actual.category === expected.expectedCategory;
  const actionCorrect = actual.recommendationType === expected.expectedAction;
  const reviewCorrect = expected.mustReview
    ? actual.confidence === 'LOW' && actual.recommendationType === null
    : actual.confidence !== 'LOW';
  const checks = {
    classificationCorrect,
    actionCorrect,
    reviewCorrect,
    sourcesResolved: actual.sourcesResolved,
    toolsScoped: actual.toolsScoped,
    replyGrounded: actual.replyGrounded,
    retrievalMatched: actual.retrievalMatched,
  };
  return { ...checks, passed: Object.values(checks).every(Boolean) };
}
