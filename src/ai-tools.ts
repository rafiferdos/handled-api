import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { GeminiProvider } from './modules/ai/gemini-provider.js';
import { EvaluationRunner } from './modules/evaluation/evaluation-runner.js';
import { AppException } from './common/errors/app.exception.js';
import { validateEnvironment } from './config/environment.js';
async function main() {
  const provider = new GeminiProvider(
    new ConfigService(validateEnvironment(process.env)),
  );
  if (process.argv[2] === 'evaluate') {
    const result = await new EvaluationRunner(provider).run();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.passed !== result.total) process.exitCode = 1;
    return;
  }
  if (process.argv[2] !== 'probe') throw new AppException('VALIDATION_ERROR');
  const signal = AbortSignal.timeout(90000),
    metadata = provider.metadata();
  const classification = await provider.classify(
    {
      ticket: {
        subject: 'Synthetic duplicate charge',
        message: 'Charged twice for the same subscription period.',
      },
    },
    signal,
  );
  const tools = await provider.planTools(
    {
      ticket: {
        subject: 'Synthetic duplicate charge',
        customerId: '00000000-0000-4000-8000-000000000001',
      },
      instruction:
        'Inspect customer profile and payment records with the allowlisted read tools.',
    },
    signal,
  );
  if (!tools.value.length) throw new AppException('AI_PROVIDER_ERROR');
  const vector = await provider.embed(
    'Synthetic duplicate charge refund policy',
    'query',
    signal,
  );
  process.stdout.write(
    `${JSON.stringify({ verification: 'live-provider-probe', metadata, classificationValidated: !!classification.value, readToolCallsValidated: tools.value.length, embeddingDimensions: vector.length, usage: classification.usage })}\n`,
  );
}
void main().catch((error) => {
  process.stderr.write(
    `${JSON.stringify({ event: 'ai.verification.failed', errorCode: error instanceof AppException ? error.code : 'AI_PROVIDER_ERROR' })}\n`,
  );
  process.exitCode = 1;
});
