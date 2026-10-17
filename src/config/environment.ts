import Joi from 'joi';

const postgresUrl = Joi.string()
  .trim()
  .uri({ scheme: ['postgres', 'postgresql'] });

const corsOrigins = Joi.string()
  .trim()
  .custom((value: string, helpers) => {
    const origins = value.split(',').map((origin) => origin.trim());
    if (
      origins.some((origin) => {
        try {
          const url = new URL(origin);
          return (
            !['http:', 'https:'].includes(url.protocol) || url.origin !== origin
          );
        } catch {
          return true;
        }
      })
    )
      return helpers.error('any.invalid');
    return origins.join(',');
  });

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(4000),
  CORS_ORIGINS: corsOrigins.default('http://localhost:3000'),
  HTTP_BODY_LIMIT_BYTES: Joi.number()
    .integer()
    .min(1024)
    .max(1048576)
    .default(102400),
  THROTTLE_LIMIT: Joi.number().integer().min(1).max(10000).default(120),
  THROTTLE_TTL_MS: Joi.number().integer().min(1000).max(3600000).default(60000),
  DATABASE_URL: postgresUrl.required(),
  DIRECT_URL: postgresUrl.allow('').optional(),
  DATABASE_POOL_MAX: Joi.number().integer().min(1).max(20).default(5),
  DATABASE_CONNECT_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
  SUPABASE_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
  SUPABASE_JWT_ISSUER: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
  SUPABASE_JWKS_URL: Joi.string()
    .uri({ scheme: ['https'] })
    .allow('')
    .optional(),
  SUPABASE_JWT_AUDIENCE: Joi.string().trim().default('authenticated'),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .allow('')
    .optional(),
  GEMINI_API_KEY: Joi.string().allow('').optional(),
  GEMINI_MODEL: Joi.string().trim().allow('').optional(),
  GEMINI_EMBEDDING_MODEL: Joi.string().trim().allow('').optional(),
  AI_PROVIDER: Joi.string().trim().allow('').optional(),
  AI_MODEL: Joi.string().trim().allow('').optional(),
  AI_TIMEOUT_MS: Joi.number().integer().min(1000).max(120000).default(30000),
  AI_MAX_RETRIES: Joi.number().integer().min(0).max(3).default(2),
  AI_PROMPT_VERSION: Joi.string().trim().allow('').optional(),
  EMBEDDING_DIMENSION: Joi.number().integer().valid(768).default(768),
  RAG_TOP_K: Joi.number().integer().min(1).max(20).default(5),
  INVESTIGATION_CONCURRENCY: Joi.number().integer().min(1).max(4).default(2),
  // Only simulated business actions are approved for the assignment MVP.
  ACTION_SIMULATION: Joi.boolean().valid(true).default(true),
  SUPPORT_FORM_TOKEN_PEPPER: Joi.string().allow('').optional(),
});

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = environmentSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });

  const partialAuth =
    (config.SUPABASE_JWT_ISSUER || config.SUPABASE_JWKS_URL) &&
    !config.SUPABASE_URL;
  if (partialAuth)
    throw new Error(
      'Environment configuration invalid: SUPABASE_URL (required for auth verification)',
    );

  if (error) {
    // Joi's raw message may quote a malformed secret. Report keys/types only.
    const problems = error.details.map(
      (detail) => `${detail.path.join('.')} (${detail.type})`,
    );
    throw new Error(
      `Environment configuration invalid: ${problems.join(', ')}`,
    );
  }

  return value as Record<string, unknown>;
}
