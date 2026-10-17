import { z } from 'zod';
import { AppException } from '../../common/errors/app.exception.js';
export const replySchema = z.strictObject({
  replyDraft: z.string().trim().min(1).max(10000),
});
export function validateEmbedding(value: unknown): readonly number[] {
  const parsed = z.array(z.number().finite()).length(768).safeParse(value);
  if (!parsed.success || !parsed.data.some((v) => v !== 0))
    throw new AppException('AI_PROVIDER_ERROR');
  const norm = Math.hypot(...parsed.data);
  if (!Number.isFinite(norm) || norm === 0)
    throw new AppException('AI_PROVIDER_ERROR');
  return parsed.data.map((v) => v / norm);
}
