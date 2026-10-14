# Ai module

Owner slot: **Team Lead**. Scope: Provider adapters, structured output validation and allowlisted read tools.

Jira entry points: SCRUM-17 / SCRUM-19 / SCRUM-109. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/ai.prisma`. Models remain unimplemented in the starter.

Read tools only. Configure provider/model IDs from the environment and verify capabilities. No action write tool, arbitrary SQL or arbitrary HTTP access; Resolve AI remains unverified.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
