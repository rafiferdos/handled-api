# Customer module

Owner slot: **Person B**. Scope: Customer profiles and support account context.

Jira entry points: SCRUM-41 / SCRUM-42 / SCRUM-43. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/customer.prisma`. Models remain unimplemented in the starter.

Expose scoped read services for the lead's tools; email/externalRef from public intake is not proof of account ownership.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
