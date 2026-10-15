# Proposal module

Owner slot: **Team Lead**. Scope: Versioned Proposal/Source/Decision and human review.

Jira entry points: SCRUM-20 / SCRUM-21 / SCRUM-22 / SCRUM-23. Confirm the current task and assignee in Jira before starting.

Schema file: `prisma/models/ai.prisma`. Models remain unimplemented in the starter.

Create immutable proposal versions; verify expectedVersion and current evidence. Pass approved commands to D through reviewed service contracts.

Step 1 `contracts/` and `dto/` define the three-action allowlist, immutable evidence, exact-version requests and proposed server-only action handoff. Read the [Lead contract guide](../../../docs/lead-contracts.md) for safe no-action results, decision/idempotency semantics and pending consumer reviews. Schema validity never authorizes execution.

Add controllers/services/DTOs and colocated unit tests here; register them in this module file. Existing module registration is already in `FeaturesModule`, so normal domain work does not require editing `main.ts` or `AppModule`. Export only explicit consumer services.

Follow [ownership](../../../docs/ownership.md), [feature development](../../../docs/feature-development.md) and [contributor workflow](../../../CONTRIBUTING.md). HTTP controllers return domain data; shared infrastructure wraps responses and errors. These module notes do not mean the feature is implemented.
