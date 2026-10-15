import { z } from 'zod';
import type { ApiPropertyOptions, SchemaObject } from '@nestjs/swagger';

// Zod's target-specific emitter has a wider JSON Schema return type. Keep the
// OpenAPI 3.0 type bridge here; validators and Swagger consume the same schema.
export function openApiSchema(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    // Runtime/TypeScript immutability does not make an HTTP field server-only.
    override: ({ jsonSchema }) => {
      delete jsonSchema.readOnly;
    },
  }) as SchemaObject;
}

// OpenAPI 3.0 nullable applies only to a type in the same schema. An explicit
// null-only branch avoids contradictory nullable/oneOf object-union metadata.
export function nullableObjectProperty(schema: z.ZodType) {
  return {
    type: Object,
    nullable: true,
    anyOf: [
      openApiSchema(schema),
      { type: 'object', nullable: true, enum: [null] },
    ],
  } satisfies ApiPropertyOptions;
}
