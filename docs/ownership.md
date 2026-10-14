# Ownership and conflict prevention

Use the [14 October canonical plan](https://app.notion.com/p/3f94ab5df14481ca9e8cf25219e10442) and [data/security contracts](https://app.notion.com/p/3f94ab5df144812c9efdde1a3ffd96f0). Owner names below are role slots; Jira records actual assignees.

| Owner     | Feature folders                                                       | Prisma files                       | Producer contract                                                                |
| --------- | --------------------------------------------------------------------- | ---------------------------------- | -------------------------------------------------------------------------------- |
| Team Lead | `ai`, `investigation`, `proposal`, evaluation scoring                 | `ai.prisma`, `evaluation.prisma`   | Provider/read tools, investigation evidence, immutable proposal/version/decision |
| Person A  | `auth`, `workspace`                                                   | `identity.prisma`                  | Verified identity, ACTIVE membership, roles and onboarding                       |
| Person B  | `customer`, `billing`, `ticket`                                       | `customer.prisma`, `ticket.prisma` | Scoped account reads, tickets/messages and golden case seeds                     |
| Person C  | `knowledge`                                                           | `knowledge.prisma`                 | Published tenant KB search and versioned citations                               |
| Person D  | `action`, `queue`, `events`, `audit`, `analytics`; evaluation jobs/UI | `operations.prisma`                | Approved action execution, durable outbox/audit and thin realtime events         |

`billing` refers to support customers' simulated billing records. Commercial billing, provider connectors and real refunds are outside the assignment MVP. The API remains in this repository's existing layout; the separate frontend is not moved into a new monorepo by this starter.

## Shared files

Coordinate changes to `package.json`, `pnpm-lock.yaml`, `src/common/`, `src/config/`, `AppModule`, `FeaturesModule`, Prisma configuration and cross-domain relations with the lead and affected owners. Use each already-registered feature module for its own controllers/providers; no repeated app bootstrap edits are needed.

Shared defaults already provide exceptions/error codes, DTO validation, response envelopes, pagination, request IDs/context, privacy-safe request logging, role/public/workspace decorators, a deny-by-default HTTP guard, idempotency header admission, Swagger helpers and queue/event types. Import the existing helper instead of copying another project's variant.

## Schema and migration sequence

1. Owner proposes their models, enums, indexes and relations in their schema file. Review cross-domain changes with both owners. One Workspace/Ticket definition; consumers add relations to it.
2. Parents expose tenant-aware unique keys; children reference the same workspace. Review nullable FK semantics and mutation checks. Generic ProposalSource evidence refs are not fictitious direct FKs to every source table.
3. Apply the combined reviewed schema to a disposable local database to create a migration with `prisma migrate dev`. The lead coordinates ordering so competing branches do not generate incompatible migration histories.
4. Commit the schema and generated migration together. Merge dependency migrations first, update feature branches from main, regenerate Prisma Client and run tests.
5. Apply only reviewed committed migrations to shared environments with `pnpm db:migrate:deploy`. Never reset or use development schema commands against the shared database.

The starter has **no business models, initial migrations or seed implementation**. Owner slots must implement those next; schema filenames/comments reserve ownership and do not prove tables exist. Supabase's managed auth schema stays outside application Prisma models.

## Consumer reviews

- A → all: identity/membership/context, JWT and revocation requirements.
- B → lead: customer/payment/subscription/access DTOs and business semantics.
- C → lead: published KB search, source versions and missing evidence behavior.
- Lead → D: approved exact proposal version and action command.
- D → UI owners: durable status, audit and authorized realtime notifications.

Each owner implements frontend integration and negative tests for their domain. New contracts must describe request, response, roles, errors, idempotency, tenant boundaries and consumer migration before merge.
