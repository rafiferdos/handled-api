# Solo backend execution order

Updated **17 October 2026**. This is the current numbered plan for this backend.
It replaces the old Lead-only sequence in [team-lead-steps.md](team-lead-steps.md).
There are **14 steps**. Frontend implementation will follow separately.

The requester is now implementing the project solo. A/B/C/D identify domain
boundaries, not people to wait for. When a step needs an unfinished domain,
implement and verify that dependency, then resume the step. Complete actual
backend workflows rather than adding placeholder tables, fake services or
successful-looking queue responses. Keep each domain in its existing module.

Only Team Lead Jira items receive progress updates. Dependency work is recorded
in this repository and in the relevant Lead item's evidence; do not update or
close A/B/C/D/shared Jira items. A backend deliverable does not establish frontend
integration or full-product Done.

## Delivery rules

- Work on a focused branch based on the current `testing` integration branch.
  Push that branch, open a PR **targeting `testing`**, verify the applicable
  checks, and merge the PR into `testing` as explicitly requested. Preserve
  meaningful commits. Do not push feature commits straight to `testing` or
  merge them into `main` or `development` under this instruction.
- Requesting a numbered step authorizes that step and its real dependencies;
  it does not authorize every later step. Record completed substeps so a later
  request resumes rather than repeats work.
- Each feature includes strict DTOs, useful OpenAPI examples, authorization,
  transaction/error handling and tests. The final steps add assembled-flow and
  operational proof; they do not postpone feature security or correctness.
- Keep backend implementation, real database/provider/worker validation,
  deployed validation and frontend acceptance separate in reports.
- Use a disposable database for migration development and destructive fixtures.
  Do not reset the shared database. Resource changes and deployment are separate
  from preparing and merging code into `testing`.
- Reuse the installed NestJS/Prisma/TypeScript stack and existing common HTTP
  infrastructure. Keep services small and exports narrow. Prefer concrete,
  inferred Prisma types to a generic repository framework.

## 1. Establish contracts and the current scope

**Build:** validate the existing Lead contracts against the current canonical
plan, define core endpoint/role/error/idempotency rules and document decisions.

**Finish when:** each subsequent feature has explicit inputs and invariants.
The Step 1 contract-authoring slice already exists at `e563515`; that is not
proof of real auth, persistence, AI or queues. The solo workflow and refreshed
test-company acceptance are documented here; final schema/API choices still need
design review.

**Lead Jira:** SCRUM-11, SCRUM-12, SCRUM-109, SCRUM-113, SCRUM-115.

## 2. Complete the prerequisites and Lead persistence

This retains the intent of the previously requested Step 2, with the requester's
new authorization to implement its dependencies. Follow the
[Step 2 design](superpowers/specs/2026-10-17-solo-backend-foundation-design.md).

1. **2.1 — Real schema and transactions:** define A's identity models, B's
   customer/billing/ticket models and the Lead's five models. Add supporting
   durable idempotency/audit/outbox records where a workflow requires them;
   establish same-tenant relations and the disposable-DB verification setup.
2. **2.2 — Complete A's core backend:** verified Supabase identity/profile,
   workspace create/read/settings, ACTIVE membership/RBAC, invitation
   issue/list/revoke/accept, member role/deactivation and last-admin protection.
   Include email-verification/session requirements and document the Supabase
   verification/reset contract for the later frontend.
3. **2.3 — Complete B's core backend:** scoped customers and account context,
   payment/subscription/access reads, tickets/messages/assignment/manual state
   transitions, safe public intake, durable creation idempotency and repeatable
   synthetic fixtures for both workspaces and the three cases.
4. **2.4 — Complete Lead persistence:** InvestigationRun/Step and
   Proposal/Source/Decision repositories, guarded lifecycle changes, immutable
   proposal versions and evidence, exact-version decisions and scoped reads.
5. **2.5 — Verify and deliver:** migrations from empty disposable DB, database
   FK/tenant/uniqueness tests, real JWT-signature verification, permission and
   HTTP validation tests, concurrent admission/version/admin/invite tests,
   documentation, meaningful commits and a PR merged into `testing`.

**Finish when:** authenticated requests use real persisted membership and can
create/read the required records; foreign-tenant relations and concurrent
invariant violations fail. Public input does not establish account ownership.
A/B's required backend workflows are implemented, not merely reserved in Prisma.
The future frontend and live AI/action execution remain separate acceptance.

**Lead Jira updates:** SCRUM-14 and the implemented schema/persistence slices of
SCRUM-20/21/22, with relevant SCRUM-12 evidence. A/B/shared issue keys are reference
dependencies only and are not updated under the current instruction.

## 3. Make background processing durable

**Build:** transactional outbox dispatch, BullMQ/Redis integration, validated
tenant-scoped jobs, atomic claims, bounded retries/backoff and recoverable
failure states. Extend the audit/outbox foundation from Step 2.

**Finish when:** commit-before-queue-failure, duplicate delivery and worker
restart retain a recoverable DB record. An HTTP 202 never implies completed
execution. This supplies the operations dependency for the Lead's jobs.

## 4. Verify and connect the AI and embedding providers

**Build:** environment-configured provider/embedding adapters, current official
capability checks, runtime schema validation, bounded timeouts/retries and
privacy-safe telemetry.

**Finish when:** the actual configured model supports the needed structured
output/read-tool behavior, actual embeddings have the configured dimensions,
and failures are surfaced honestly. Resolve AI remains unverified until tested;
model names in older notes are not hardcoded or assumed available.

**Lead Jira:** SCRUM-17, SCRUM-111, SCRUM-112.

## 5. Complete the knowledge and published-policy backend

**Build:** draft/create/read/update/publish/archive, immutable policy revisions,
chunking/index jobs, 768-dimensional scoped vector retrieval and source lookup.
Seed the three policies. Keep old cited revisions auditable.

**Finish when:** real embedding/vector search retrieves only eligible published
policy in the requested workspace. Archived, stale-index and conflicting/missing
sources have explicit behavior. This completes the required C-domain producer
used by the Lead; optional knowledge-gap drafting is not a prerequisite.

## 6. Connect read tools and classification

**Build:** the five allowlisted tools, scoped account/knowledge adapters,
category/priority classification, source metadata and missing-evidence policy.

**Finish when:** tools return actual authorized records, classification is
validated, and unsupported tools/tenant IDs/timeouts cannot fabricate facts.
No arbitrary SQL/HTTP or write tool is exposed to the model.

**Lead Jira:** SCRUM-15/16/19/99/109/110.

## 7. Run investigations through the real API and worker

**Build:** create/list/detail/retry endpoints, durable admission, the investigation
processor, recorded steps/tools/durations, safe terminal states and new-run retry.

**Finish when:** an authorized request causes the actual worker to gather scoped
facts and policy using the configured provider. Active-run races are blocked;
provider/tool failure persists a failure or manual-review outcome. Timeline data
contains evidence/actions, never private model chain-of-thought.

**Lead Jira:** SCRUM-13/14/17/18/112.

## 8. Produce stored proposals, citations and reply drafts

**Build:** evidence-backed recommendation, confidence/missing facts, resolvable
source snapshots and editable reply. Use immutable proposal revisions.

**Finish when:** output validation and source resolution precede persistence;
invalid or conflicting output cannot become an executable recommendation.
The five AI capabilities remain separately observable and testable.

**Lead Jira:** SCRUM-20/21/98/113/114/115.

## 9. Complete human decisions and all three simulated actions

**Build:** edit/approve/reject/escalate, exact-version checks, current human
permission and target/policy checks, atomic decision/action/audit/outbox admission,
the simulated executor, action reads/retry and unknown-outcome reconciliation.

**Finish when:** duplicate refund changes the eligible duplicate once;
cancellation preserves period end and valid access; restoration changes only the
eligible customer's product. Rejected/LOW/unverified/stale proposals have no
business effect. Both admission and worker execution recheck authorization and
business state. Database changes are real; external financial/provider effects
remain simulated. This completes the required action-domain dependency.

**Lead Jira:** SCRUM-22/23/116/117/118; describe dependent action evidence on these
items without modifying D's tasks.

## 10. Finish realtime, audit and essential admin reporting

**Build:** authenticated Socket rooms and thin events, durable REST recovery,
scoped audit/action history and basic DB-derived analytics/admin APIs.

**Finish when:** another tenant cannot subscribe/read/count records; expired or
revoked membership loses access, and reconnect/refetch recovers committed state.
If the approved deployment uses polling, its recovery path must be tested.

## 11. Measure AI behavior

**Build:** versioned evaluation harness with at least 20 labeled cases, including
three golden cases and at least ten negatives. Measure each AI capability,
schema/source/action/escalation correctness, latency and provider usage.

**Finish when:** results are reproducible and failures are reported; targets are
not advertised as measured accuracy. Evaluation/scoring remains a Lead concern.

**Lead Jira:** SCRUM-30.

## 12. Harden the assembled backend

**Build/verify:** expired/revoked identity, ADMIN/AGENT/VIEWER, tenant guesses,
prompt injection, malformed output, stale evidence/versions, duplicate jobs,
simultaneous approvals, DB/Redis/provider failures and OUTCOME_UNKNOWN recovery.
Review grants/RLS, query bounds, indexes, sensitive logs, backup/restore and
scoped fixture maintenance.

**Finish when:** all must-pass safety cases have executable evidence and known
material failures are resolved or explicitly block release.

**Lead Jira:** applicable SCRUM-12/23/80/81/82 coordination slices.

## 13. Prove the deployment and worker operating model

**Build/verify:** reviewed migration application, deployed API configuration,
DB/Redis/provider access, worker idle/wake/restart/retry behavior and recovery
runbooks. Resolve ADR-011/012 from real evidence before promising a working host.

**Finish when:** the serving commit and environment support the actual async
flow. The dated Render foundation preview is not worker-continuity evidence.
Merging into `testing` is not a production deployment or a shared-DB migration.

## 14. Verify all backend golden flows and deliver the handoff

**Verify:** fresh public ticket submission through the real API, authenticated
investigation, actual AI/RAG, human decision, queued simulated DB change and
persisted action/audit reads for all three cases; include rejected and safe-failure
cases. Finish OpenAPI, ERD, setup/env/migration/seed instructions and evidence.

**Finish when:** API/DB/provider/worker evidence proves the backend flow for the
serving commit. Hand over stable API contracts for the later frontend work.
The complete product still needs the separately planned hosted-form/dashboard
browser acceptance; backend completion is not full-product sign-off.

**Lead Jira:** SCRUM-104 and relevant Lead verification/coordination slices.

## After the required backend

Knowledge-gap detection/draft, a quality-center API/dashboard expansion and
advanced analytics are SHOULD work after the required path is stable. Incident
clustering, connectors, commercial subscriptions, widgets and real external
writes remain outside this MVP sequence.

## Source and status notes

The [Handled hub](https://app.notion.com/p/3f24ab5df14481e7875bdb241eff1529),
[canonical plan](https://app.notion.com/p/3f94ab5df14481ca9e8cf25219e10442),
[data/security contracts](https://app.notion.com/p/3f94ab5df144812c9efdde1a3ffd96f0),
[release gates](https://app.notion.com/p/3f94ab5df1448151bbb0e7814fddfb38), and linked
implementation references were reread on 17 October. The new test-company goal
requires actual runtime processing before a paying customer exists. Historical
team assignments and waiting rules are superseded for this execution by the
requester's solo instruction; security and module boundaries are retained.

At the verified starting commit `e563515`, business models, real auth and domain
services are still absent. This document is a plan, not Step 2 implementation or
new passing runtime evidence. See [planning sources](planning-sources.md) and the
[Step 1 verification record](step-1-verification.md) for dated context.
