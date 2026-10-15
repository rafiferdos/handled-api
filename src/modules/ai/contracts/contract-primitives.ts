import { z } from 'zod';

// Contract bounds are shared by runtime validation and HTTP/OpenAPI metadata.
export const ContractLimit = {
  SUMMARY: 4000,
  REPLY: 10000,
  REASON: 2000,
  REFERENCE: 256,
  FACT: 1000,
  FACTS: 20,
  SOURCES: 50,
  EXCERPT: 4000,
  TOOL_QUERY: 1000,
  TOP_K: 20,
} as const;

export const resourceIdSchema = z.uuid();
export const positiveIntegerSchema = z
  .number()
  .int()
  .min(1)
  .max(Number.MAX_SAFE_INTEGER);
export const nonNegativeIntegerSchema = z
  .number()
  .int()
  .min(0)
  .max(Number.MAX_SAFE_INTEGER);
export const timestampSchema = z.iso.datetime({ offset: true });

// Preserve text exactly: validation must not silently rewrite evidence or hashes.
export function textSchema(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .regex(/\S/, 'Must contain non-whitespace text');
}

export const referenceSchema = textSchema(ContractLimit.REFERENCE);
export const contentHashSchema = z.string().regex(/^[a-f0-9]{64}$/);
