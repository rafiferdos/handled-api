# Team Lead backend execution order

Updated **15 October 2026** after the requester's clarification: this is the
backend build order, from the first implementation task to the last. There are
**10 steps**. This numbering replaces the previous 11-step scope list.
Frontend implementation is outside this backend sequence.

The HTTP/team starter is already implemented. Begin with the Lead's domain
contracts; do not rebuild bootstrap, shared validation or common error handling.

Sources: [Lead epic SCRUM-5](https://team-singularity.atlassian.net/browse/SCRUM-5),
[canonical plan](https://app.notion.com/p/3f94ab5df14481ca9e8cf25219e10442),
[data/security contracts](https://app.notion.com/p/3f94ab5df144812c9efdde1a3ffd96f0),
[release gates](https://app.notion.com/p/3f94ab5df1448151bbb0e7814fddfb38),
[ownership](ownership.md), and [feature conventions](feature-development.md).

## How to execute the sequence

- Normal order: **1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10**.
- “Do Step N” authorizes that step. Check its real prerequisites, implement and
  verify its scope, then report back. Do not automatically start the next step.
- **If a required module, model, exported service or agreed interface from another
  owner is missing, pause the current step and notify the requester.**
- Identify the owner/module, missing requirement, Jira issue, completed local
  slice and exact condition needed to resume. Preserve partial work; do not
  label the step complete.
- Do not implement another owner's module, create shadow parent tables, bypass
  auth, invent another domain's behavior or fake a queued job/action to pass a
  dependency gate.
- Consume existing reviewed producer interfaces when they are ready. Cross-owner
  schema/shared-file changes still require the established coordination.
- Each step includes its own meaningful validation and tests. Step 10 tests the
  assembled backend flow; security checks are not postponed until then.
- Isolated unit-test doubles do not establish real auth, database, provider,
  worker or business-flow integration. Keep local implementation evidence
  separate from reviewed, integrated feature Done in Jira.

## Step 1 — Define the Lead's API and data contracts

**Build:** Investigation/Proposal/Decision request and response DTOs, runtime
output schemas, enums/state rules, error/status contracts, expectedVersion,
idempotency semantics, and typed read-tool/approved-action interfaces. Reuse
existing common helpers.

**Result before moving on:** the Lead's models/services have explicit inputs,
outputs and invariants to implement. Validate the authored contracts and document
producer/consumer expectations. A draft is not a claim that another owner's
service exists or that cross-owner contract freeze is approved.

**Dependency gate:** owner review is required for shared contracts and relations.
Pause any change that requires unavailable producer decisions.

**Jira:** SCRUM-11, SCRUM-12, SCRUM-109, SCRUM-113, SCRUM-115.

## Step 2 — Create the Lead's database models and persistence

**Build:** InvestigationRun, InvestigationStep, Proposal, ProposalSource and
ProposalDecision in ai.prisma; workspace constraints/indexes, persistence
operations and a coordinated reviewed migration.

**Result before moving on:** real Lead records can be created/read with correct
same-workspace relations, immutable proposal-version foundations and DB tests.
Follow the disposable-database migration process; do not reset the shared DB.

**Dependency gate:** A's Profile/Workspace/Membership and B's Customer/Ticket
parent contracts/models must exist where referenced. Never create those parents
in the Lead schema.

**Current checkpoint:** at audited commit 6f64a12 these business parent models are
absent. Step 2 must pause at the affected schema/migration dependency unless the
owners have implemented them by execution time.

**Jira:** SCRUM-14, schema slices of SCRUM-20/21/22; coordinate SCRUM-89.

## Step 3 — Connect and verify the AI provider

**Build:** environment-configured provider adapter and structured-output
validation, with timeouts, retries, safe errors and privacy-safe provider/model
telemetry.

**Result before moving on:** the actual configured provider/model can return a
validated result; malformed output and provider failures are handled safely.
Verify capabilities against current official documentation and live evidence.
Do not hardcode model IDs or assume Resolve AI compatibility.

**Dependency gate:** the Step 1 interfaces and required provider configuration,
credentials and capability decisions. This step alone does not implement account
tools, investigations or action execution.

**Jira:** provider slice of SCRUM-17, SCRUM-111, SCRUM-112.

## Step 4 — Connect the allowed account and knowledge read tools

**Build:** validated, workspace-scoped adapters for customer/payment/subscription/
product-access context and published KB search with versioned source metadata.

**Result before moving on:** real account facts and eligible published KB
evidence can be retrieved through reviewed services. Verify tenant isolation and
failure/missing-evidence behavior. No write tool or arbitrary SQL/HTTP escape.

**Dependency gate:** B's account/ticket read services, C's published/versioned KB
search and A's verified identity/workspace contract.

**Jira:** SCRUM-15, SCRUM-16, SCRUM-109, SCRUM-111.

## Step 5 — Implement ticket classification and review policy

**Build:** validated AI category/priority classification and policy for missing,
weak or contradictory evidence using the provider and verified ticket context.

**Result before moving on:** classification and review reasons are testable; weak
evidence cannot silently authorize an action. Persist/update ticket data only
through the agreed producer boundary.

**Dependency gate:** Steps 3–4 inputs and B's ticket service if a ticket read or
mutation is required. Never directly take over B's ticket mutations.

**Jira:** SCRUM-19, SCRUM-99.

## Step 6 — Build the real investigation flow and its APIs

**Build:** investigation admission/create, status/list/detail, recorded
InvestigationStep/tool/source outcomes and bounded tool-call orchestration.
Connect the actual durable queue/worker handoff and lifecycle/failure states.

**Result before moving on:** an authenticated request can start a real run, the
worker can use classification and allowed tools, evidence is persisted, and the
run's actual progress/results can be retrieved. Long-running admission returns
the reviewed 202 contract only when durable admission is implemented.

**Dependency gate:** Steps 2–5, A's auth/ACTIVE membership, B's ticket access and
D's investigation queue/outbox/worker interfaces. Stop if any required producer is
missing; do not claim complete product resolution before Steps 7–8.

**Jira:** SCRUM-13, runtime slice of SCRUM-14, SCRUM-18, orchestration slice of
SCRUM-17, SCRUM-110, SCRUM-112.

## Step 7 — Produce evidence-backed proposals and reply drafts

**Build:** resolution recommendation, confidence/alternatives, immutable proposal
versions, resolvable typed citations/source versions and editable customer reply.

**Result before moving on:** a completed evidence-gathering run produces a stored,
schema-valid proposal/reply that can be read through the backend. Missing or
conflicting evidence follows the safe-review policy rather than inventing
sources. Preserve historical evidence and versions.

**Dependency gate:** Step 6 recorded evidence, Step 2 persistence and B/C source
resolution/freshness interfaces.

**Jira:** SCRUM-20, SCRUM-21, SCRUM-98, SCRUM-113, SCRUM-114, SCRUM-115.

## Step 8 — Add human decisions and safe action handoff

**Build:** edit/approve/reject/escalate endpoints, persisted human decisions,
expectedVersion/confidence/permission checks and exact approved-command handoff
to D. Editing creates a new immutable proposal version.

**Result before moving on:** only an authorized, current, eligible human-approved
proposal can enter durable action admission. Stale versions conflict; rejected
or unsafe proposals cannot execute; duplicate approval cannot cause duplicate
effects. Audit/outbox/transaction behavior uses the reviewed D-owned service.

**Dependency gate:** Step 7, A's active membership/roles and revocation policy,
B/C current eligibility/evidence interfaces, and D's action admission, audit,
outbox and durable idempotency implementation. Do not execute actions in the
Lead module.

**Jira:** SCRUM-22, SCRUM-23, SCRUM-116, SCRUM-117, SCRUM-118.

## Step 9 — Measure AI behavior with the evaluation harness

**Build:** the Lead-owned scoring/result contract and repeatable suite of at least
20 labeled cases, including three golden cases and at least ten negatives.
Record model/prompt/dataset versions and measured schema, citation, action/
escalation and safety outcomes.

**Result before moving on:** all five AI capabilities have separate measured
evidence: classification, account investigation, cited KB retrieval,
recommendation and editable reply. Report failures and measured results honestly;
targets are not current accuracy claims.

**Dependency gate:** Steps 3–8 for integrated evaluation, B/C golden fixtures and
D's actual action flow. Optional persisted EvaluationCase/Run/Result models belong
to the Lead; a quality-center dashboard and its jobs belong to D and are not
required to build the scoring harness.

**Jira:** SCRUM-30.

## Step 10 — Verify the complete backend and finish the handoff

**Build/verify:** run the three real backend flows: double-charge simulated refund,
period-end cancellation and product-access restoration. Exercise auth/tenant
denials, malformed AI output, prompt injection, stale versions, concurrency,
retries, queue failures and unknown outcomes.

**Result:** source data → classification/investigation → cited proposal/reply →
human decision → D's simulated action/audit is verified through actual APIs and
DB state. Finish Swagger, migration/configuration instructions, test/evaluation
evidence and reviewed handoff documentation.

**Dependency gate:** the previous steps plus actual A/B/C/D producers and seed
data. Hosted-backend claims require the target deployment to be verified.
Missing frontend or public deployment evidence must remain explicit; backend
completion alone is not a full product release sign-off.

**Jira:** Lead-owned verification/coordination slices of SCRUM-80, SCRUM-81,
SCRUM-82 and SCRUM-104.

The execution instruction is now unambiguous: **start with Step 1 contracts,
then Step 2 database, then provider → tools → classification → investigation →
proposal → decisions → evaluation → complete backend verification.**
