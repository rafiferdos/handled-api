# Auth module

Owner slot: **Person A**. Scope: JWT/JWKS verification, identity/profile sync, verification/reset flows.

Jira entry points: SCRUM-32 / SCRUM-34 / SCRUM-35. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/identity.prisma`. Models remain unimplemented in the starter.

Replace DenyAccessContextResolver via AuthModule's AccessContextResolver provider. Export the verified identity and ACTIVE membership resolver; keep token claims out of role decisions.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
