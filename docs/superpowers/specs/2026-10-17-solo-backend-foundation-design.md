# Solo backend foundation and Lead persistence

Date: **17 October 2026**. Status: **requester accepted the design and delegated
technical choices: "jeta best mone hoy koro"**. This is design approval, not an
implementation, peer-review or deployment claim.
Primary Lead issue: [SCRUM-14](https://team-singularity.atlassian.net/browse/SCRUM-14).
This describes Step 2 of the [solo backend sequence](../../solo-backend-steps.md).
No product code or migration is delivered by this design document.

## Intended result

The requester now works solo and authorizes implementation across the former
A/B/C/D boundaries when the Lead's work needs it. Step 2 must deliver real
database persistence and its necessary A/B backend workflows, rather than wait
for separate owners or create pretend parent models. Frontend work is deferred.
Only Lead Jira items receive updates. Deliver code through a feature PR merged
into `testing`; changes to `main`, `development`, hosting and shared databases
are not implicit consequences of that merge.

At source commit `e563515`, NestJS/common HTTP infrastructure and Lead contract
authoring exist. `identity.prisma`, `customer.prisma`, `ticket.prisma` and
`ai.prisma` still contain ownership comments only. AuthModule uses a deny-all
resolver. There is no business migration, seed or domain service to extend.

## Chosen approach and alternatives

Use the existing modular monolith and complete the missing prerequisites in
dependency order: combined schema/transaction foundation → identity/workspace →
customer/ticket → Lead persistence → database/HTTP/concurrency verification.
Keep each deliverable independently understandable and use meaningful commits.

A schema-only approach is smaller but leaves the requested A/B backend
dependencies unfinished. Implementing every project feature in Step 2 would
combine provider, knowledge, queue hosting and UI decisions into one delivery.
The selected approach finishes the required foundation while leaving the real
AI, orchestration and action workflow to their explicit later steps.

"Complete" here means the canonical MVP backend workflows in the named modules.
The old 71-endpoint expansion inventory does not automatically become mandatory;
core reads may use account-context aggregation. New endpoints must have an
explicit consumer and contract. Frontend/account-security screens, optional
knowledge gaps, commercial billing/connectors and real provider writes are not
part of this backend step.

## Architecture and dependency direction

- Keep the registered modules and the single DatabaseModule/PrismaService.
- Auth owns verification and profile bootstrap; Workspace owns membership,
  invitations and workspace settings. Existing AccessContextResolver becomes a
  real implementation, not a second parallel authorization framework.
- Customer/Billing export scoped account projections; Ticket owns creation,
  messages, assignment and state transitions. A ticket/customer reference is
  never authorization evidence by itself.
- Investigation and Proposal own their persistence operations. They consume
  narrow identity, membership, ticket and evidence contracts.
- The audit/outbox component supplies real transactional record writers where
  foundation mutations require them. Durable request idempotency is a shared
  database concern. Queue dispatch/execution is a later step; storing outbox
  intent does not claim that a worker exists.
- Do not use `forwardRef`, service locators, arbitrary model-name repositories
  or a cross-domain CRUD framework to hide a circular dependency. Compose a
  transaction at the workflow boundary and pass a typed transaction client to
  the concrete participating writers.

## Schema and referential integrity

Define the existing domain models in their reserved schema files:

| Module                  | Models                                                                          |
| ----------------------- | ------------------------------------------------------------------------------- |
| Identity/workspace      | Profile, Workspace, Membership, Invite                                          |
| Customer/billing/ticket | Customer, Subscription, Payment, ProductAccess, Ticket, TicketMessage           |
| Lead                    | InvestigationRun, InvestigationStep, Proposal, ProposalSource, ProposalDecision |
| Supporting transactions | durable idempotency record, AuditEvent, OutboxEvent where required              |

Use UUID identifiers and UTC timestamps. Profile identity corresponds to
Supabase Auth; keep Supabase's managed auth tables and passwords outside Prisma.
Do not introduce commercial SaaS subscription/connector/evaluation tables.

Enforce these invariants in the database and in scoped service operations:

1. Every business row has `workspaceId`. Parents expose tenant-aware unique
   keys; children use composite foreign keys. Nullable parent references still
   require scoped mutation validation and matching non-null keys.
2. A payment's optional subscription belongs to both its workspace and customer.
   A proposal's investigation belongs to its workspace and ticket. Merely
   validating each global UUID separately does not establish either invariant.
3. Scoped external/reference keys and membership uniqueness reject duplicates.
   Case/slug normalization is performed once at the boundary and tested.
4. Membership and actor references preserve historical identity after disable.
   Current ACTIVE status/role is checked at mutation time. Concurrent removal or
   demotion must not leave a workspace without an active admin.
5. Only one QUEUED/RUNNING investigation per workspace/ticket is admitted. Use a
   database constraint/atomic admission; an application pre-check is insufficient.
   Retry creates a new run with a same-ticket, same-workspace predecessor.
6. Each proposal revision has its own UUID; version numbers increase within an
   investigation, with `UNIQUE(workspaceId, investigationId, version)`. Editing
   creates a new UUID/revision and supersedes the old one. Content and source
   snapshots are append-only; only permitted lifecycle metadata changes.
   Decisions use a composite FK to the exact proposal UUID/version. Concurrent
   edits cannot produce two current revisions. Current-ticket/run eligibility
   is checked again by the later decision workflow.
7. A run's recorded step sequence is unique and positive. Lifecycle updates use
   compare-and-swap predicates. Terminal runs do not reopen on retries.
8. Evidence stores typed refs, observed time, immutable excerpt/hash and KB
   document/version/chunk metadata. Generic sources do not acquire fictitious
   multi-target FKs. Source resolution is implemented when the producer exists;
   schema validity alone does not establish evidence truth.
9. Money uses integer minor units and a separate currency. Validate nonnegative
   values, periods, string/JSON bounds and valid temporal relationships. Add
   SQL constraints where Prisma cannot express an invariant.
10. Retain historical tickets, proposal revisions, decisions and audits.
    Workspace suspension, member disable and customer blocking must not cascade
    away the evidence. Audit records are append-only to the application.

Place business tables in a dedicated `handled` PostgreSQL schema and keep that
schema outside the Supabase Data API exposure list. Verify exposure and explicit
grants/revocations for `anon`/`authenticated`; apply deny-by-default RLS as defense
in depth. Browser clients reach business data through NestJS, not direct table
access. Preserve verified TLS and bounded connection pools. Do not change
managed auth settings or shared DB roles as an undocumented side effect.

## Identity, workspaces and invitations

Verify tokens against configured trusted Supabase identity settings: signature,
allowed algorithm, issuer, audience, required expiry and UUID subject. Never
select a JWKS endpoint from token-controlled metadata, accept unsigned tokens,
or trust user-editable metadata for workspace permissions. Bound network/key
retrieval and fail closed on invalid identity or unavailable required checks.

Use Supabase-verified identity/email and current account/session checks where
required for sensitive operations. Roles and workspace access always come from
persisted ACTIVE membership and an active workspace. Define email verification,
logout/revocation and password-reset integration in the API/configuration docs;
backend code must not pretend those future frontend flows have been tested.
Current official Supabase behavior must be checked before choosing SDK calls.

Core workflows: `/me` and idempotent profile bootstrap; workspace create/list/
detail/settings; member list/role/deactivation; invitation create/list/revoke/
accept. Workspace creation and its first ADMIN membership are one transaction.
Service methods independently scope reads, counts and writes. Normalize UUID
case at the boundary so equivalent valid UUIDs do not create authorization
inconsistencies.

Invitations use cryptographically random tokens, only hashed tokens in storage,
expiry/revocation checks and single-use acceptance. Acceptance requires the
authenticated, verified email to match the invited address and must not escalate
an existing membership through a stale/replayed invite. Sensitive tokens do not
enter logs or unrelated list responses. Real outbound invitation email is a
separately configured effect; issuing a token is not evidence of sending mail.

## Account, ticket and public-intake workflows

Implement scoped customer create/list/detail/update/account-context and the
payment/subscription/product-access read services needed by the API and Lead.
Use dedicated projections rather than exposing Prisma records. Synthetic
account setup is authorized tooling; admin demo-only mutation endpoints are
included only if a core consumer requires them and they are audited.

Implement authenticated ticket create/list/filter/detail/update, messages,
assignment/unassignment and allowed manual status transitions. Assignment uses
an ACTIVE ADMIN/AGENT membership in the same workspace. Human route permissions
must not permit writing workflow-owned states such as EXECUTING/RESOLVED to
simulate a completed action. Ticket+first message and state-change+audit writes
are atomic. Internal-note visibility is explicit; no public private-data reads.

Public intake is `POST /api/v1/public/workspaces/:workspaceSlug/tickets` with
strict body validation, configured support-form checks, body/rate/spam bounds,
origin policy and `Idempotency-Key`. Synchronously persisted ticket/message
creation returns 201 and a safe receipt. CORS or a public form token alone is
not identity verification. Untrusted email/customer refs do not establish
customer ownership or eligibility for a later effect. Any synthetic test-company
mapping remains explicit and cannot authorize actions on its own.

Durable idempotency scopes the operation, workspace, actor/public context, target
and key; compares a canonical request hash and saves the logical result in the
same transaction. Same-key/same-payload retries replay that result; changed
payload returns `IDEMPOTENCY_CONFLICT`. Recheck authorization before private
replay. Concurrent duplicates create one logical result, including after a lost
HTTP response. The existing header guard alone provides none of this.

## Lead persistence

Provide concrete, typed operations for scoped run admission/read/step recording/
guarded transition, proposal revision/source persistence/read, and exact-version
decision recording. The decision writer participates in a caller-owned
transaction; it is not a public approval shortcut. The later policy/action
coordinator owns approval admission and atomic action/audit/outbox creation.
Validate structured payloads with the existing Zod contracts and HTTP inputs
with the existing DTO pipeline. Use explicit response mapping.

The persistence layer does not register fake AI producers, return fabricated
investigation completion, approve business effects without current policy checks
or pretend to enqueue an absent worker. Public Lead investigation/approval
orchestration stays in its later numbered step. Internal persistence behavior is
tested with real database records and the agreed contracts.

## Migration, fixtures and failure behavior

Use Prisma 7's existing migration workflow against a disposable database; commit
schema and reviewed SQL migration together. Verify migration from empty DB and
repeat deployment behavior, including raw constraints/indexes. Do not run
development/reset commands on the existing Supabase environment. Applying a
shared migration, provisioning Auth accounts or changing infrastructure requires
the concrete target and operational action to be explicit first.

Fixtures contain AcmeCloud, PixelDesk, distinct ADMIN/AGENT/VIEWER identities and
the three synthetic account/ticket cases. Keep credentials out of source and
publishable output. Fixture setup is repeatable and scoped; destructive reset
is disposable-only unless separately authorized. KB policies/embeddings are
seeded with the knowledge step rather than faked here.

Use bounded serializable/compare-and-swap operations for concurrent invariants;
retry only recognized transaction conflicts with a small bound. Do not replay
external effects inside retries. Preserve existing safe error envelopes:
400 invalid input, 401 invalid identity, 403 disallowed role, 404 absent or
foreign-tenant resources, 409 stale state/version/idempotency conflict, and safe
dependency failures without raw Prisma/provider errors or secrets.

## Required verification

- Empty-database migration and regeneration; applicable format/lint/typecheck,
  unit, HTTP and production-build checks on the pinned runtime.
- Real PostgreSQL FK, tenant, customer/subscription, ticket/run, nullable-FK,
  unique/version, lifecycle and rollback behavior; isolated mocks do not prove
  these constraints.
- Cryptographic JWT cases: valid, wrong issuer/audience/key/algorithm, missing or
  expired expiry, invalid subject, unavailable required verification; database
  membership/workspace disable and stale/revoked identity behavior.
- ADMIN/AGENT/VIEWER permission matrix; guessed IDs and item/count leakage;
  case-equivalent UUIDs; strict DTO, null/unknown-field and pagination behavior.
- Concurrent last-admin changes, invite acceptance/revocation, duplicate ticket
  creation, active-run admission, proposal edits and stale decision recording.
- Public receipts reveal no account details; public identity hints cannot
  establish effect eligibility; expired tokens and spam inputs fail safely.
- Immutable revision/evidence history, failed transaction rollback and durable
  audit/idempotency/outbox records survive retry and request loss.

Run feature tests as each slice is built, then the full repository quality gate.
Track what is implemented, locally verified, live-verified and deferred. A green
mock suite does not establish Supabase account integration, AI execution,
worker hosting, frontend functionality or an unqualified zero-bug guarantee.

## Delivery and review boundary

Implement on focused feature branches, preserve meaningful commits and use PRs
targeting `testing`. The requester explicitly authorizes merging verified PRs
there. Do not fabricate peer approval or merge the existing main-targeted PR.
Only Lead Jira items receive updates, with exact completed slices and evidence.

The requester accepted this design in the conversation on 17 October and
delegated technical choices. The detailed implementation plan records the
execution slices. This file does not authorize shared-resource changes or assert
Step 2 completion.
