import { Inject, Injectable } from '@nestjs/common';
import { AiProvider } from '../ai/ai-provider.js';
import type { AiUsage } from '../ai/ai-provider.js';
import { readToolCallSchema } from '../ai/contracts/read-tool.contracts.js';
import {
  classificationSchema,
  proposalOutputSchema,
} from '../ai/contracts/proposal-output.schema.js';
import { evaluationCases, EVALUATION_VERSION } from './evaluation-cases.js';
import {
  evaluationFixture,
  evaluationPolicies,
  evaluationPolicySource,
} from './evaluation-fixtures.js';
import { scoreEvaluation } from './evaluation-scoring.js';
import { AppException } from '../../common/errors/app.exception.js';
@Injectable()
export class EvaluationRunner {
  constructor(@Inject(AiProvider) private readonly provider: AiProvider) {}
  async run() {
    const metadata = this.provider.metadata(),
      signal = AbortSignal.timeout(20 * 60000);
    const policyVectors: Array<readonly number[]> = [];
    for (const policy of evaluationPolicies)
      policyVectors.push(
        await this.provider.embed(policy.text, 'document', signal),
      );
    const results = [];
    for (const c of evaluationCases) {
      const start = Date.now();
      const usage: Partial<
        Record<'classification' | 'tools' | 'recommendation' | 'reply', AiUsage>
      > = {};
      try {
        const fixture = evaluationFixture(c),
          ticket = {
            subject: c.subject,
            message: c.message,
            customerId: fixture.customerId,
          };
        const classified = await this.provider.classify({ ticket }, signal);
        usage.classification = classified.usage;
        const classification = classificationSchema.parse(classified.value);
        const planned = await this.provider.planTools(
          { ticket, customerId: fixture.customerId, classification },
          signal,
        );
        usage.tools = planned.usage;
        const tools = planned.value;
        const toolsScoped =
          tools.length > 0 &&
          tools.every(
            (call) =>
              readToolCallSchema.safeParse(call).success &&
              (!('customerId' in call.arguments) ||
                call.arguments.customerId === fixture.customerId),
          );
        const vector = await this.provider.embed(
          `${c.subject} ${c.message}`,
          'query',
          signal,
        );
        const ranked = evaluationPolicies
          .map((policy, i) => ({
            policy,
            score: vector.reduce(
              (sum, value, j) => sum + value * policyVectors[i][j],
              0,
            ),
          }))
          .sort((a, b) => b.score - a.score);
        const retrieved =
          fixture.missingPolicy || c.policy === null
            ? []
            : ranked
                .slice(0, 1)
                .map((r) => evaluationPolicySource(r.policy, r.score));
        const sources = [...fixture.sources, ...retrieved];
        const recommended = await this.provider.recommend(
          { ticket, classification, observations: fixture, sources },
          signal,
        );
        usage.recommendation = recommended.usage;
        const generated = proposalOutputSchema.parse(recommended.value);
        const drafted = await this.provider.reply(
          { proposal: generated, sources },
          signal,
        );
        usage.reply = drafted.usage;
        const reply = drafted.value;
        const score = scoreEvaluation(c, {
          category: classification.category,
          recommendationType: generated.recommendation?.type ?? null,
          confidence: generated.confidence,
          sourcesResolved: generated.evidenceRefs.every((ref) =>
            sources.some((s) => s.sourceRefId === ref),
          ),
          toolsScoped,
          replyGrounded:
            reply.replyDraft.trim().length > 0 &&
            !/already refunded|has been refunded|we have (?:cancelled|restored|refunded)/i.test(
              reply.replyDraft,
            ),
          retrievalMatched:
            c.policy === null || fixture.missingPolicy
              ? true
              : ranked[0]?.policy.kind === c.policy,
        });
        results.push({
          caseId: c.id,
          ...score,
          durationMs: Date.now() - start,
          usage,
        });
      } catch (error) {
        results.push({
          caseId: c.id,
          passed: false,
          errorCode:
            error instanceof AppException ? error.code : 'AI_PROVIDER_ERROR',
          durationMs: Date.now() - start,
          usage,
        });
      }
    }
    return {
      version: EVALUATION_VERSION,
      provider: metadata,
      verification: 'provider-benchmark-with-synthetic-facts',
      boundaries:
        'Does not execute DB mutations, BullMQ or hosted flows. Grounding uses provided sources and a limited forbidden-claims check; human evaluation is still required.',
      usageCoverage:
        'Successful structured-output stages only; failed attempts and embedding token usage are unavailable. This is not total billed usage.',
      createdAt: new Date().toISOString(),
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      results,
    };
  }
}
