import { z } from 'zod';
import type { SchemaObject } from '@nestjs/swagger';

// Zod's target-specific emitter has a wider JSON Schema return type. Keep the
// OpenAPI 3.0 type bridge here; validators and Swagger consume the same schema.
export function openApiSchema(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
}
