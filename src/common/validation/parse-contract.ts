import type { z } from 'zod';
import { AppException } from '../errors/app.exception.js';
export function parseContract<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new AppException('VALIDATION_ERROR');
  return result.data;
}
