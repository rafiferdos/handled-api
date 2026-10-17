import { ConfigService } from '@nestjs/config';
import { GenerateContentResponse } from '@google/genai';
import { GeminiProvider } from './gemini-provider.js';
import type { GeminiClient } from './gemini-provider.js';
const config = () =>
  new ConfigService({
    AI_PROVIDER: 'gemini',
    GEMINI_API_KEY: 'test-only',
    AI_MODEL: 'configured-model',
    GEMINI_EMBEDDING_MODEL: 'configured-embedding',
    AI_PROMPT_VERSION: 'v1',
    AI_TIMEOUT_MS: 30,
    AI_MAX_RETRIES: 0,
  });
function client(
  text: string,
  embedding: number[] = Array(768).fill(1),
): GeminiClient {
  return {
    generateContent: async () =>
      Object.assign(new GenerateContentResponse(), {
        candidates: [
          {
            content: { role: 'model', parts: [{ text }] },
            finishReason: 'STOP',
          },
        ],
      }),
    embedContent: async () => ({ embeddings: [{ values: embedding }] }),
  };
}
it('fails closed without explicit model/provider configuration', () => {
  expect(() =>
    new GeminiProvider(new ConfigService()).metadata(),
  ).toThrowError();
});
it('rejects malformed classification and unsafe unsupported tool calls', async () => {
  const provider = new GeminiProvider(
    config(),
    client('{"category":"invented"}'),
  );
  await expect(
    provider.classify({ subject: 'Issue' }, new AbortController().signal),
  ).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
  const transport = client('ignored');
  transport.generateContent = async () =>
    Object.assign(new GenerateContentResponse(), {
      candidates: [
        {
          content: {
            role: 'model',
            parts: [{ functionCall: { name: 'refundPayment', args: {} } }],
          },
          finishReason: 'STOP',
        },
      ],
    });
  await expect(
    new GeminiProvider(config(), transport).planTools(
      {},
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
});
it.each([
  Array(767).fill(1),
  Array(768).fill(0),
  [...Array(767).fill(1), Number.NaN],
])('rejects an invalid embedding', async (values) => {
  await expect(
    new GeminiProvider(config(), client('{}', values)).embed(
      'Policy',
      'document',
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'AI_PROVIDER_ERROR' });
});
it('enforces a real abort deadline instead of waiting for an unbounded provider', async () => {
  const transport = client('{}');
  transport.generateContent = async (input) =>
    new Promise((_, reject) =>
      input.config?.abortSignal?.addEventListener(
        'abort',
        () => reject(new Error('aborted')),
        { once: true },
      ),
    );
  await expect(
    new GeminiProvider(config(), transport).classify(
      {},
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({ code: 'DEPENDENCY_TIMEOUT' });
});
