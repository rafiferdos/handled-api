import type { ConfigService } from '@nestjs/config';
import { AppException } from '../../common/errors/app.exception.js';
export function providerConfig(config: ConfigService) {
  const key = config.get<string>('GEMINI_API_KEY');
  const model =
    config.get<string>('AI_MODEL') || config.get<string>('GEMINI_MODEL');
  const embeddingModel = config.get<string>('GEMINI_EMBEDDING_MODEL');
  const promptVersion = config.get<string>('AI_PROMPT_VERSION');
  if (
    config.get<string>('AI_PROVIDER') !== 'gemini' ||
    !key ||
    !model ||
    !embeddingModel ||
    !promptVersion
  )
    throw new AppException('DEPENDENCY_UNAVAILABLE');
  if (
    [model, embeddingModel, promptVersion].some(
      (x) => x.length > 100 || !/^[a-zA-Z0-9._/-]+$/.test(x),
    )
  )
    throw new AppException('DEPENDENCY_UNAVAILABLE');
  return {
    provider: 'gemini' as const,
    key,
    model,
    embeddingModel,
    promptVersion,
    timeout: config.get<number>('AI_TIMEOUT_MS', 30000),
    retries: config.get<number>('AI_MAX_RETRIES', 2),
  };
}
