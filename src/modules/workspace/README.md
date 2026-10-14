# Workspace module

Owner slot: **Person A**. Scope: Workspace, Membership and Invite APIs.

Jira entry points: SCRUM-31 / SCRUM-36 / SCRUM-37 / SCRUM-40. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/identity.prisma`. Models remain unimplemented in the starter.

Implement workspace-scoped membership queries and invite rules with auth. Export a narrow service to the auth resolver; review cross-domain identity contracts with the lead.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
