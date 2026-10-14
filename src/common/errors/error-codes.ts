// Shared wire contract. Add domain codes here through a cross-owner review.
export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  PROPOSAL_VERSION_CONFLICT: 'PROPOSAL_VERSION_CONFLICT',
  IDEMPOTENCY_CONFLICT: 'IDEMPOTENCY_CONFLICT',
  DUPLICATE_RESOURCE: 'DUPLICATE_RESOURCE',
  BUSINESS_RULE_FAILED: 'BUSINESS_RULE_FAILED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RATE_LIMITED: 'RATE_LIMITED',
  AI_PROVIDER_ERROR: 'AI_PROVIDER_ERROR',
  DEPENDENCY_UNAVAILABLE: 'DEPENDENCY_UNAVAILABLE',
  DEPENDENCY_TIMEOUT: 'DEPENDENCY_TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export const ERROR_CATALOG = {
  VALIDATION_ERROR: { status: 400, message: 'Request validation failed' },
  UNAUTHENTICATED: { status: 401, message: 'Authentication required' },
  FORBIDDEN: { status: 403, message: 'Permission denied' },
  RESOURCE_NOT_FOUND: { status: 404, message: 'Resource not found' },
  INVALID_STATE_TRANSITION: { status: 409, message: 'Invalid state transition' },
  PROPOSAL_VERSION_CONFLICT: { status: 409, message: 'Proposal version changed' },
  IDEMPOTENCY_CONFLICT: { status: 409, message: 'Idempotency key conflict' },
  DUPLICATE_RESOURCE: { status: 409, message: 'Resource already exists' },
  BUSINESS_RULE_FAILED: { status: 422, message: 'Business rule failed' },
  PAYLOAD_TOO_LARGE: { status: 413, message: 'Request body too large' },
  RATE_LIMITED: { status: 429, message: 'Too many requests' },
  AI_PROVIDER_ERROR: { status: 502, message: 'AI provider failed' },
  DEPENDENCY_UNAVAILABLE: { status: 503, message: 'Dependency unavailable' },
  DEPENDENCY_TIMEOUT: { status: 504, message: 'Dependency timed out' },
  INTERNAL_ERROR: { status: 500, message: 'Internal server error' },
} satisfies Record<ErrorCode, { status: number; message: string }>;
