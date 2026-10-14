# Knowledge module

Owner slot: **Person C**. Scope: Knowledge documents/chunks/gaps, publication, embeddings and scoped RAG.

Jira entry points: SCRUM-58 / SCRUM-63 / SCRUM-122. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/knowledge.prisma`. Models remain unimplemented in the starter.

Persist source versions/chunk references; only published tenant content is searchable. Keep vector(768) SQL migrations in the reviewed Prisma migration stream.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
