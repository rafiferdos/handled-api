import { AiProvider } from '../../src/modules/ai/ai-provider.js';
import {
  Confidence,
  TicketPriority,
} from '../../src/common/contracts/domain.enums.js';
import type { AiResult } from '../../src/modules/ai/ai-provider.js';
import type {
  Classification,
  ProposalOutput,
} from '../../src/modules/ai/contracts/proposal-output.schema.js';
import type { ReadToolCall } from '../../src/modules/ai/contracts/read-tool.contracts.js';
const result = <T>(value: T): AiResult<T> => ({
  value,
  usage: { inputTokens: 10, outputTokens: 10, durationMs: 1 },
});
/** Deterministic external boundary only. Never registered by a production module. */
export class FixtureProvider extends AiProvider {
  beforeEmbed?: () => Promise<void>;
  classification: Classification = {
    category: 'OTHER',
    priority: TicketPriority.MEDIUM,
    confidence: Confidence.LOW,
    missingFacts: ['Fixture has no configured recommendation'],
  };
  output?: ProposalOutput;
  calls: readonly ReadToolCall[] = [];
  metadata() {
    return {
      provider: 'gemini' as const,
      model: 'fixture-model',
      embeddingModel: 'fixture-embedding',
      promptVersion: 'fixture-v1',
    };
  }
  classify() {
    return Promise.resolve(result(this.classification));
  }
  planTools() {
    const calls = this.calls;
    this.calls = [];
    return Promise.resolve(result(calls));
  }
  recommend() {
    if (!this.output) throw new Error('Fixture output must be explicit');
    return Promise.resolve(result(this.output));
  }
  reply() {
    return Promise.resolve(
      result({
        replyDraft:
          'This is a proposed resolution for human review. No account change has been completed.',
      }),
    );
  }
  async embed() {
    await this.beforeEmbed?.();
    return Array.from({ length: 768 }, (_, i) => (i === 0 ? 1 : 0));
  }
}
