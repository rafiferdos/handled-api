import Joi from 'joi';

const postgresUrl = Joi.string()
  .trim()
  .uri({ scheme: ['postgres', 'postgresql'] });

export const environmentSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(4000),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
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
});

export function validateEnvironment(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const { error, value } = environmentSchema.validate(config, {
    allowUnknown: true,
    abortEarly: false,
  });

  if (error) {
    throw new Error(`Environment configuration invalid: ${error.message}`);
  }

  return value as Record<string, unknown>;
}
