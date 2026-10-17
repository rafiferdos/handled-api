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
it('returns a safe dependency error when the caller has already cancelled', async () => {
  const signal = AbortSignal.abort();
  await expect(
    new GeminiProvider(config(), client('{}')).classify({}, signal),
  ).rejects.toMatchObject({ code: 'DEPENDENCY_UNAVAILABLE' });
});
it('uses the documented Embedding 2 task prefix without the unsupported taskType field', async () => {
  const settings = config();
  settings.set('GEMINI_EMBEDDING_MODEL', 'gemini-embedding-2');
  const transport = client('{}');
  transport.embedContent = async (input) => {
    if (
      input.config?.taskType !== undefined ||
      input.contents !== 'task: search result | query: refund policy'
    )
      throw new Error('Embedding 2 protocol rejected');
    return { embeddings: [{ values: Array(768).fill(1) }] };
  };
  expect(
    await new GeminiProvider(settings, transport).embed(
      'refund policy',
      'query',
      new AbortController().signal,
    ),
  ).toHaveLength(768);
});
it.each(['gemini-3.8-flash', 'models/gemini-3.8-flash'])(
  'completes classification within its deadline for %s by bounding thinking effort',
  async (model) => {
    const settings = config();
    settings.set('AI_MODEL', model);
    const classification = {
      category: 'BILLING_DUPLICATE_CHARGE',
      priority: 'MEDIUM',
      confidence: 'LOW',
      missingFacts: [],
    };
    const response = client(JSON.stringify(classification));
    const transport: GeminiClient = {
      ...response,
      generateContent: async (input) => {
        if (input.config?.thinkingConfig?.thinkingLevel !== 'LOW')
          return new Promise((_, reject) => {
            input.config?.abortSignal?.addEventListener(
              'abort',
              () => reject(new Error('Thinking exceeded the deadline')),
              { once: true },
            );
          });
        return response.generateContent(input);
      },
    };
    const result = await new GeminiProvider(settings, transport).classify(
      { subject: 'Synthetic duplicate charge' },
      new AbortController().signal,
    );
    expect(result.value).toEqual(classification);
  },
);
it('keeps Gemini 3 thinking levels out of legacy generation requests', async () => {
  const settings = config();
  settings.set('AI_MODEL', 'gemini-2.5-flash');
  const classification = {
    category: 'BILLING_DUPLICATE_CHARGE',
    priority: 'MEDIUM',
    confidence: 'LOW',
    missingFacts: [],
  };
  const response = client(JSON.stringify(classification));
  const transport: GeminiClient = {
    ...response,
    generateContent: async (input) => {
      if (input.config?.thinkingConfig !== undefined)
        throw new Error(
          'Legacy model does not accept Gemini 3 thinking levels',
        );
      return response.generateContent(input);
    },
  };
  const result = await new GeminiProvider(settings, transport).classify(
    { subject: 'Synthetic duplicate charge' },
    new AbortController().signal,
  );
  expect(result.value).toEqual(classification);
});
