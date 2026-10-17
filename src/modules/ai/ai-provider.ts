import type {
  Classification,
  ProposalOutput,
} from './contracts/proposal-output.schema.js';
import type { ReadToolCall } from './contracts/read-tool.contracts.js';
export interface ProviderMetadata {
  provider: 'gemini';
  model: string;
  embeddingModel: string;
  promptVersion: string;
}
export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}
export interface AiResult<T> {
  value: T;
  usage: AiUsage;
}
export abstract class AiProvider {
  abstract metadata(): ProviderMetadata;
  abstract classify(
    input: unknown,
    signal: AbortSignal,
  ): Promise<AiResult<Classification>>;
  abstract planTools(
    input: unknown,
    signal: AbortSignal,
  ): Promise<AiResult<readonly ReadToolCall[]>>;
  abstract recommend(
    input: unknown,
    signal: AbortSignal,
  ): Promise<AiResult<ProposalOutput>>;
  abstract reply(
    input: unknown,
    signal: AbortSignal,
  ): Promise<AiResult<{ replyDraft: string }>>;
  abstract embed(
    text: string,
    task: 'document' | 'query',
    signal: AbortSignal,
  ): Promise<readonly number[]>;
}
