# Evaluation module

Owner slot: **Team Lead (scoring/schema), Person D (processing/dashboard)**. Scope: Fixed AI cases, run/result contract and quality presentation.

Jira entry points: SCRUM-30 / SCRUM-9. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/evaluation.prisma`. This file is reserved for the lead's future evaluation models.

The lead is the single schema owner. Coordinate queue/dashboard work with D; quality claims require labeled case results and model/prompt versions.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
