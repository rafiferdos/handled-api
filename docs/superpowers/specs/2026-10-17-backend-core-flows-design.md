# Backend core flows design

17 October 2026. Continues the approved solo roadmap after Step 2, on `testing`
at `2f65c07`. The requester now authorizes several consecutive backend steps in
one delivery, using the existing checkout and native execution. Frontend remains
separate. Routine design choices are delegated to the implementer.

## Outcome and scope

Implement roadmap Steps 3–12 as connected delivery slices: durable background
processing, configured Gemini adapter, published knowledge and vector search,
five read tools, investigation API/worker, proposals with verified sources,
human decisions and three simulated actions, durable polling/audit/analytics,
and an evaluation harness. Finish the backend's required workflows; leave real
provider credentials, shared migration/grants and hosting acceptance explicit
when unavailable. No fake production provider, canned proposal or claimed live
AI accuracy. Optional gaps/incidents/commercial connectors stay deferred.

## Approach

Keep the modular NestJS/Prisma 7/strict TypeScript stack and installed packages.
PostgreSQL is the source of truth. BullMQ is a delivery mechanism; the committed
outbox and domain status allow recovery even after Redis loss. Use one explicit
`worker` entry point and opt-in background runtime. Default API startup performs
no polling or provider requests. Deploy API and worker independently.

Alternative considered: DB polling alone removes Redis but violates the chosen
queue contract; request-time AI makes restarts and deadlines fragile. Retain
BullMQ with DB recovery. For frontend refresh choose authenticated REST polling,
already allowed by the roadmap, rather than add a second socket authorization
surface before hosting is decided.

## Durability

Persist job intents with business admission in one identity-bound transaction.
Payloads contain only workspace/resource/request identifiers; workers load the
canonical payload from the DB and reject mismatched queue data. Dispatcher claims
bounded batches with SKIP LOCKED and expiring UUID tokens. A crash after enqueue
is safe: outbox UUID is the BullMQ job ID and completed domain work is a no-op.
Only acknowledge an outbox record after successful handler completion; expired
leases and published-but-unfinished intents are redispatched. Bounded retry with
backoff and a visible exhausted state, no lost committed job. Worker heartbeat
and final compare-and-swap prevent stale processors committing. DB-only action
effects and final status/audit commit atomically, so retry never duplicates them.

## Provider and tools

Gemini is the implemented baseline behind an injectable provider interface;
Resolve remains unverified. No hardcoded model ID. Require key, generation model,
embedding model and prompt version before admitting provider jobs. Use the
installed official SDK, abortable deadlines, bounded calls/retries, output-token
limits, Zod validation, and finite nonzero 768-dimensional embeddings. Store only
usage/duration/error codes, never raw prompt/response or private reasoning.

Classify first; execute an allowlisted read-tool loop with a fixed iteration,
call and time budget; generate structured recommendation and reply separately.
The model cannot choose a workspace, different ticket/customer, SQL, URL or write
operation. Account data has concrete producer schemas and truncation warnings.
Ticket/policy text is untrusted evidence, never system instructions. Missing or
conflicting critical facts/policy force LOW/null recommendation and manual review.

## Knowledge

KnowledgeDocument holds editable draft content and current published version;
immutable KnowledgeRevision holds published content/hash and structured action
policy rules. KnowledgeChunk stores versioned content/hash plus vector(768).
Publishing queues indexing; search includes ACTIVE workspace, PUBLISHED documents,
current revision, matching embedding model, READY index only. Exact scoped cosine
search avoids approximate-filter recall surprises at MVP size. Old cited revision
and chunks remain readable as history; archived or changed policy cannot authorize
a new action. Policy rules are human-authored ADMIN data, never inferred from
prose by the model. Refund policy requires matching duplicate payments; cancel
and restore have separate explicit rules. Reindex cannot expose partial chunks.

## Investigation and evidence

Admission requires active writer, verified ticket customer, valid ticket state,
and configured provider. Atomically create run, update ticket and enqueue. Retry
creates a new run. Worker rechecks originating member/account/session at execution,
records only external checks, step timing, usage and safe failures, then validates
every citation against tool observations or current indexed chunks before storing
a proposal. Revalidate ticket/customer state at commit; changed state fails safely.
Only the latest run may produce an actionable proposal. Lease fencing handles
restart while allowing bounded re-execution of read-only AI work.

## Human decisions and simulated actions

Expose edit/approve/reject/escalate; immutable content and exact-version decisions
reuse Step 2 repositories. Approve requires Idempotency-Key, latest completed run,
AWAITING_APPROVAL ticket, HIGH or explicitly human-reviewed MEDIUM, verified active
customer, current published policy source, current account evidence and eligible
target. Create decision/action/outbox/ticket status in one guarded transaction.
Store actor session and admission evidence; worker rechecks current verified
account/session/membership (without retaining or replaying a JWT), proposal,
policy, target and ticket under the workspace lock.

Refund marks one eligible duplicate SETTLED payment REFUNDED and retains another
matching payment. Cancellation sets cancelAtPeriodEnd without changing period or
access. Restore activates only the subscription's eligible product after a settled
current-period payment. Persist before/after, action status and audit atomically.
FAILED may retry after current admin checks; OUTCOME_UNKNOWN only reconciles and
never blindly replays. Production adapters remain impossible in this build.

## Recovery, reporting and evaluation

Authenticated bounded REST reads provide run/proposal/action/audit state after
restart/reconnect; polling is the selected refresh contract. Analytics derive
counts from scoped DB rows and do not advertise invented accuracy. A versioned
20+ labeled evaluation set includes all three golden cases and at least ten
negatives, with an opt-in actual-provider runner and safe result artifacts.

## Verification and boundaries

Run unit, signed-JWT HTTP, actual PostgreSQL/pgvector and local Redis/BullMQ tests.
Cover concurrent approvals/workers, Redis unavailability after commit, expired
leases, malformed provider output, wrong workspace/customer/tool, archived/stale
policy, unverified identity, revoked human permission and duplicate effects.
Tests may inject a deterministic provider at the external boundary; clearly label
that as integration evidence, never actual AI capability proof. Run the existing
full check and fresh-context final review. Deliver meaningful commits through a
PR merged to `testing`; update only Lead Jira items with implemented versus live
verification limits. Shared database, hosting and real-provider acceptance are
separate from a tested code merge.

Sources reread: Notion canonical master, data/security, complete AI instructions,
release gates, future operations and deployment pages (16 October updates).
