# Backend core setup and operation

Updated **17 October 2026**. This delivery connects the roadmap's core processing
code after Step 2. Read the [verification record](backend-core-verification.md)
for what was actually exercised. Provider and hosted acceptance remain explicit.
The [schema map](backend-schema.md) lists all 22 tables and principal relations.

## Runtime, schema and environment

Use Node **22.23.3**, pnpm **11.25.0** and the frozen lockfile. The installed Nest,
Prisma, Google GenAI and BullMQ versions are retained. No new dependency is needed.
The [foundation guide](backend-foundation-setup.md) covers asymmetric Supabase
Auth, private identity lookup, runtime roles, public intake and scoped seeds.

There are now **five migrations and 22 business tables**. The fifth migration,
`20261017104000_backend_core`, adds KnowledgeDocument, KnowledgeRevision,
KnowledgeChunk and ActionExecution, run usage/snapshot fields, composite tenant
relations and immutable-history constraints. Supabase-managed Auth tables remain
outside application migration ownership.

The reviewed migration creates pgvector in **`extensions`** and stores 768-element
vectors. If pgvector already exists in another schema, the migration deliberately
refuses that layout; inspect the target and prepare a reviewed migration instead
of automatically moving its extension. The server role needs reviewed access to
`handled`, the identity function, `extensions` and vector operations, plus the
required business-table DML and trusted RLS authority. Browser roles retain no
business access. Test role names are not production grants.

On an explicitly approved database target, after backup/restore and role review:

```bash
pnpm db:validate
pnpm db:migrate:deploy
pnpm db:generate
```

This delivery does not apply migrations or grants to shared Supabase. Do not use
`db push`, reset or development migration commands against shared data. Immutable
evidence, decisions and successful action history make destructive rollback
unsafe; restore from a reviewed backup or apply a corrective forward migration.

Configure database/Auth first, then use the [short Gemini guide](gemini-quickstart.md)
and [configuration reference](configuration.md). Missing provider configuration
rejects provider-dependent admissions; the API never substitutes a fake model.
`ACTION_SIMULATION=false` is rejected by configuration validation.

## API and worker processes

```bash
pnpm build
pnpm start:prod
```

In a second process with the same directory and environment:

```bash
pnpm worker:prod
```

The API does not start a worker or connect Redis during bootstrap. The worker
dispatches transactional DB intents to the `handled-work` BullMQ queue and runs
knowledge indexing, investigation and approved simulated actions. Deploy both
processes with matching migrations/configuration. API `/ready` checks the database;
it is not Redis, provider or worker readiness. Worker continuity on the intended
host remains ADR-012's separate acceptance gate.

Jobs carry only outbox/workspace/claim UUIDs. Type, target and request correlation
come from the canonical DB row. Dispatch claims only available worker capacity
instead of leasing a long Redis backlog. Claims use `SKIP LOCKED`; an atomic
token exchange admits one execution owner even when the same delivery arrives
concurrently. A 60-second lease renews every 20 seconds; stale completion and
release cannot replace a newer owner's state. A fresh expired claim gets a new
Redis job ID. Redis deduplication is not the business-effect guarantee.

Delivery retries are bounded to five with exponential backoff capped at 60 seconds.
After exhaustion, an ADMIN can list `/api/v1/workspaces/:workspaceId/jobs` and
retry a `FAILED` intent using `POST .../jobs/:jobId/retry` with
`{"expectedAttempts":5}` (use the current returned value). Inspect and fix the
dependency first. The retry resets attempts and records an audit event. Do not
edit leases/statuses directly in the shared DB.

## Knowledge and evidence

All paths below are relative to `/api/v1/workspaces/:workspaceId`.

| Operation             | Path                                                                    | Authority   |
| --------------------- | ----------------------------------------------------------------------- | ----------- |
| List/detail documents | GET `/knowledge/documents`, `/knowledge/documents/:documentId`          | VIEWER+     |
| Create/update draft   | POST `/knowledge/documents`, PATCH `/knowledge/documents/:documentId`   | ADMIN       |
| Publish/reindex       | POST `/knowledge/documents/:documentId/publish` or `/reindex`           | ADMIN       |
| Archive               | POST `/knowledge/documents/:documentId/archive`, or DELETE the document | ADMIN       |
| Search preview        | POST `/knowledge/search-preview`                                        | ADMIN/AGENT |

Updates include the complete draft content and `expectedVersion`; lifecycle
requests include `expectedVersion`. Publication snapshots immutable content/rules
and atomically queues indexing. Draft edits preserve the old published revision
until the next publish. Archived documents are retained for audit. A detail read
includes `publishedRevision.indexStatus` and a safe failure code.

Policies contain structured `allowedActions`, optional `maxRefundMinor` and
optional `deniedActions`. A current published denial blocks the action even when
another policy allows it. At least one current cited policy must allow it; the
strictest applicable refund ceiling is enforced. Operators must reconcile
contradictory policies. Three canonical policies are seeded as **drafts**; a
repeated seed preserves human edits and never pretends indexing happened.

Indexing stages actual provider vectors outside a DB transaction, then rechecks
workspace status, lease and published version before committing chunks/READY.
Archive, republish or workspace suspension prevents stale chunk publication.
Exact cosine retrieval is scoped to the current published READY revision and
configured embedding model, with a 0.5 minimum score and bounded top-K. Reindex
after changing the embedding model; do not mix vectors from different models.
Old versions/chunks remain auditable and are not eligible current evidence.

## Investigation, human decision and effect

1. Public intake creates a ticket but does not establish customer ownership. An
   authorized human verifies the scoped customer first.
2. ADMIN/AGENT starts `POST /tickets/:ticketId/investigations`. An existing active
   run is returned; otherwise the run, ticket state and durable intent commit
   together. A 202 receipt means admitted work. Retry a terminal failed/review
   run with `POST /investigations/:investigationId/retry`, creating a new run.
3. The worker rechecks current origin identity/session/membership, gathers scoped
   account facts and published policy, classifies, runs at most three tool rounds
   and ten read calls, recommends and drafts a reply. There are only five read
   tools; no model write tool, arbitrary SQL or arbitrary HTTP endpoint exists.
4. Provider calls have configured timeouts/bounded retries; investigations also
   have a 120-second cancellation deadline. Strict schemas reject malformed
   output. Missing/ambiguous facts, LOW confidence or unresolved/invented sources
   cannot yield an executable proposal. Recorded steps describe observations and
   outcomes, never private chain-of-thought. Source snapshots use canonical hashes.
5. The final transaction rechecks authority, ticket/customer version, lease and
   every current source before publishing proposal/run/ticket/audit state together.
6. ADMIN/AGENT reads the exact proposal version, then edits, approves, rejects or
   escalates. Edits create immutable revisions and cannot overwrite confidence or
   evidence. MEDIUM approval requires a reason; LOW cannot execute. Only approval
   requires `Idempotency-Key`. Same scoped key/body returns the original queued
   receipt; a changed body conflicts. Poll the action for current execution state.
7. Approval validates current facts and current cited policy, recording the exact
   human decision, action, ticket state, audit and outbox in one transaction. The
   worker rechecks authority and all preconditions immediately before effects.

The three effects change actual scoped database rows while external effects remain
simulated: refund only the eligible duplicate settled payment; schedule cancellation
without removing paid-through access; restore only the eligible customer's exact
product access. The effect, before/after snapshot, success status, audit and outbox
completion commit together. Duplicate deliveries cannot apply a second effect.

GET `/tickets/:ticketId/actions` and `/actions/:actionId` are VIEWER+ scoped reads.
ADMIN action retry requires `expectedVersion`, an eligible retryable FAILED state,
current policy/facts and fewer than three attempts. `OUTCOME_UNKNOWN` cannot retry
blindly. Reconcile returns the current scoped target and `MANUAL_REVIEW_REQUIRED`;
matching target state does not prove which action caused it. Imported unknown
records need an operator decision. `EXECUTION_FAILED` tickets can return to
`NEEDS_REVIEW` for a fresh investigation instead of being stranded.

## Refresh, reporting and evaluation

Authenticated REST polling is this delivery's refresh/recovery contract. Refetch
investigation/proposal/action/audit state after admission, reconnect and worker
restart. Each read checks current membership; no Socket server is shipped.

Ticket audit reads are VIEWER+; workspace audit and durable-job administration are
ADMIN. Analytics `/analytics/overview`, `/issues`, `/ai` are scoped VIEWER+ reads
with ISO date bounds (30 days by default, at most 366). Counts come from actual
rows. Operational approval rate is not model accuracy; measured accuracy remains
null until separately evaluated. No raw provider errors, credentials or private
prompts are returned in status/audit responses.

`pnpm ai:probe` calls the configured model for schema/tool behavior and a 768-vector.
`pnpm ai:evaluate` runs the versioned **22-case provider benchmark**, including
three golden cases and 19 negatives. It reports independent classification,
action/review, source/tool, retrieval and limited reply checks with latency and
observed successful-stage token usage. Failed attempts and embedding token usage
are not exposed by the current abstraction; these numbers are not total billing.
This benchmark provides synthetic facts, does not execute tools against the DB
or run actions/BullMQ, and has no persisted evaluation-run history API. Reply
grading includes a limited forbidden-claims check, so human review remains needed.
Failed cases cause a nonzero exit; do not advertise unmeasured accuracy.

## Local verification

Use disposable PostgreSQL **with pgvector** and Redis. The DB runner only accepts
an explicit loopback URL with database name `handled_test`; Redis tests require
an explicit `127.0.0.1` port and DB **15**. Never pass a shared database URL.

```bash
pnpm check
TEST_DATABASE_URL=postgresql://handled:handled_test_only@127.0.0.1:55433/handled_test TEST_REDIS_URL=redis://127.0.0.1:56379/15 pnpm test:db
```

The verification record provides container/version evidence and counts. Golden
HTTP tests use the actual API, signed JWT verification, PostgreSQL/pgvector,
transactional domain handlers and persisted effects with an injected provider at
the external boundary. Actual Redis transport has its own outage/restart/backlog
tests. Neither substitutes for a key-backed provider test or a deployed golden flow.

## Retention and remaining acceptance

Immutable proposals/sources/decisions/policy revisions/action snapshots grow over
time. No automatic history deletion is shipped. Define lawful retention and a
tested archival/restore process before storing real customer data; do not disable
history guards to perform cleanup. Local fixtures use synthetic data only.

Remaining gates are live Gemini/model evaluation, reviewed shared migration and
runtime grants, durable hosted Redis/worker operation, deployed three-case backend
acceptance and the later frontend. Optional knowledge-gap drafting, quality-center
history/UI, advanced analytics and real external provider writes are outside this
delivery. A `testing` PR merge establishes code integration, not deployment.
