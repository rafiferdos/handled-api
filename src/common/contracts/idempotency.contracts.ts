export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;
export const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;

export function isIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && IDEMPOTENCY_KEY_PATTERN.test(value);
}
