# Events module

Owner slot: **Person D**. Scope: Authenticated Socket.IO notifications.

Jira entry points: SCRUM-9. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/operations.prisma`. Models remain unimplemented in the starter.

Use /support and shared event names. Verify token and membership on room join/reconnect; event payloads are thin and clients recover through REST.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
