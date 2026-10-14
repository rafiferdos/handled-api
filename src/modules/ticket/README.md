# Ticket module

Owner slot: **Person B**. Scope: Ticket and TicketMessage workflows, assignment and state transitions.

Jira entry points: SCRUM-45 / SCRUM-46 / SCRUM-95. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/ticket.prisma`. Models remain unimplemented in the starter.

Own ticket state transitions and scoped read/write services. Public intake also needs abuse protection and durable idempotency; @Public does not provide those.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
