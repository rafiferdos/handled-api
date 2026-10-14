# Action module

Owner slot: **Person D**. Scope: Simulated ActionExecution and server-side policy.

Jira entry points: SCRUM-66 / SCRUM-67 / SCRUM-128 / SCRUM-129 / SCRUM-130. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/operations.prisma`. Models remain unimplemented in the starter.

Recheck approval, tenant, version, current business state and eligibility in admission and worker. Use scoped database uniqueness and atomic claims; reconcile OUTCOME_UNKNOWN before retry.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
