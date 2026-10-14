# Shared contracts

These are starter contracts from the [14 October ownership/security plan](https://app.notion.com/p/3f94ab5df144812c9efdde1a3ffd96f0). Review changes with the producer and consumer before merge. TypeScript types do not validate incoming data.

- `access-context.ts`: Person A implements `AccessContextResolver` in AuthModule; the starter resolver denies all private access. Authenticate with verified JWKS signature, issuer, audience and expiry. Resolve ACTIVE membership from the database, never token user metadata or a client header. Services must still scope every query by verified workspace.
- `domain.enums.ts`: common wire values. Schema owners define their Prisma enums with matching values in their owned model file. No business tables or state-machine implementation is provided yet.
- `async.contracts.ts`: queue names, tenant-scoped payloads and thin realtime events. Person D owns runtime validation, outbox dispatch, atomic claims, retries and room authorization. Carry request/trace IDs from API to workers. A TypeScript payload is not proof of tenant authorization or durable enqueue.

The lead owns shared API conventions; each domain owns its DTOs, runtime schemas and Swagger examples. Import contracts from their specific file; avoid a global barrel that couples unrelated modules.
