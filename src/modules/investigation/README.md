# Investigation module

Owner slot: **Team Lead**. Scope: InvestigationRun/Step lifecycle and recorded evidence.

Jira entry points: SCRUM-13 / SCRUM-14 / SCRUM-18. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/ai.prisma`. Models remain unimplemented in the starter.

Consume scoped read services from B and C. Use shared InvestigationJob payloads and persist tool outcomes, never hidden model chain-of-thought.

Step 1 request/response contracts live in `dto/`. Trigger/retry have empty bodies; use `EmptyInvestigationBodyPipe`. The [Lead contract guide](../../../docs/lead-contracts.md) defines admission, active-run conflicts, retries and reusable `LeadEndpoint` metadata. Real controllers, persistence and D's queue integration remain later work.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
