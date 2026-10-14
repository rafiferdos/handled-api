# Queue module

Owner slot: **Person D**. Scope: Redis/BullMQ, outbox dispatch, retries and worker lifecycle.

Jira entry points: SCRUM-65 / SCRUM-71. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/operations.prisma`. Models remain unimplemented in the starter.

Use common queue names/payloads; business state + outbox belong in one DB transaction. Header validation and Redis job IDs alone do not prevent duplicate effects.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
