# Solo Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans
> to implement this plan task by task. Steps use checkbox syntax for tracking.

**Goal:** complete Step 2's real A/B backend dependencies and tenant-safe Lead
persistence, delivered through verified PRs merged into `testing`.

**Architecture:** retain the registered modular NestJS application. Use one
Prisma client, concrete transaction-aware domain services, a private `handled`
schema, database-enforced tenant/version invariants and verified Supabase
identity. Native execution in this checkout is preferred; one independent
whole-branch review follows implementation.

**Tech Stack:** existing Node 22.23.3, pnpm 11.25.0, strict TypeScript 6,
NestJS 12, Prisma 7, PostgreSQL, jose, Zod, Vitest/Supertest.

**Spec:** [foundation design](../specs/2026-10-17-solo-backend-foundation-design.md).

## Global constraints

- Frontend implementation is deferred. Only Lead Jira items receive updates.
- Keep A/B/C/D as module boundaries; implement dependencies instead of waiting
  for separate owners. No shadow tables, fake queue or fabricated AI success.
- Feature branch → PR targeting `testing` → applicable checks → merge into
  `testing`. No direct feature push to integration branches or merge to `main`.
- Preserve the existing compatible runtime and package majors; no Dockerfile,
  CI/CD, GraphQL or commercial connector/billing scope.
- Use UUIDs, UTC timestamps, integer minor-unit money, tenant-aware foreign keys,
  immutable history, strict boundary validation and narrow module exports.
- Migration development/tests use a disposable PostgreSQL database. Never reset
  or automatically migrate the existing shared Supabase environment.
- Each task follows RED → GREEN and a meaningful commit. Save full test output
  in the plan's ignored execution workspace, not in chat or committed logs.

## Review focus

1. Concurrent admin demotion and invite acceptance must preserve current
   authority; Task 5 pins races rather than testing sequential checks only.
2. UUID case, nullable FKs and mismatched same-tenant parents must not bypass
   authorization or customer/ticket consistency; Tasks 1/3/6/9 pin these.
3. Public identity hints and idempotent replay must not reveal or authorize
   private account data; Tasks 2/8 pin response and ownership behavior.
4. Logout/revocation or expired identity between guard and mutation must fail
   closed; Tasks 3/5 pin fresh session and membership revalidation.
5. New-run retries and proposal edits must retain exact historical evidence and
   decisions; Tasks 9/10 pin concurrency and immutable snapshots.

## File and interface map

- `prisma/models/*.prisma`, `prisma/schema.prisma`, generated migration SQL:
  domain models, tenant constraints, private schema and indexes.
- `src/common/database/unit-of-work.ts`, `workspace-actor.ts`,
  `idempotency.service.ts`: bounded transaction retry, verified actor context and
  durable request replay. `src/modules/audit/audit-writer.ts` supplies typed
  transaction-local audit/outbox writers.
- `src/modules/auth/`: verified JWT/session identity and profile APIs.
- `src/modules/workspace/`: workspace, membership and invitation workflows.
- `src/modules/customer/`, `billing/`, `ticket/`: concrete A/B producer services,
  HTTP DTOs/controllers, projections and ticket state machine.
- `src/modules/investigation/investigation.repository.ts`,
  `src/modules/proposal/proposal.repository.ts`: concrete Lead persistence.
- `test/database/`, `vitest.config.db.ts`, `scripts/test-database.mjs`:
  disposable DB safety, migration, real-DB service and HTTP integration suites.
- `prisma/seed.ts`, setup/configuration/verification docs: repeatable scoped
  synthetic records, secure identity setup and honest delivery evidence.

### Task 1: Disposable database verification and schema

**Files:** schema/model files; `test/database/helpers.ts`;
`test/database/schema.db-spec.ts`; `vitest.config.db.ts`;
`scripts/test-database.mjs`; package scripts; generated migration SQL.

**Interfaces:** consumes explicit `TEST_DATABASE_URL`; produces generated Prisma
models in schema `handled` and a test helper `createTestDatabase()` returning
`{ prisma: PrismaClient, close(): Promise<void> }`. Safety accepts only the
explicit disposable loopback test database; it never falls back to `.env`.

- [ ] Write DB tests requiring all 15 core models plus transactional supporting
      records; assert cross-workspace FKs, mismatched customer/subscription and
      ticket/run links, nullable FK behavior, scoped uniqueness and no cascade loss.
- [ ] Run `pnpm test:db -- test/database/schema.db-spec.ts`; observe missing
      schema/model behavior fail against the disposable DB.
- [ ] Define models/enums/relations; generate migration with the installed
      Prisma 7 CLI against disposable PostgreSQL. Add SQL checks, active-run/current
      revision partial unique indexes, append-only history protections and RLS/grants.
- [ ] Run the same DB test plus `pnpm db:validate` and `pnpm typecheck`; require
      all assertions and generation to pass. Verify migration from empty DB.
- [ ] Commit `feat(SCRUM-14): add tenant-safe foundation schema and migrations`.

### Task 2: Typed transaction, authorization and idempotency foundations

**Files:** common database actor/transaction/idempotency helpers; audit writer;
`test/database/transactions.db-spec.ts`.

**Interfaces:** `UnitOfWork.run<T>(work: (tx: Prisma.TransactionClient) =>
Promise<T>): Promise<T>`; `WorkspaceActor` carries user/session/workspace and
verified token expiry. `assertWorkspaceActor(tx, actor, roles)` returns current
ACTIVE membership or a safe denial. `IdempotencyService.run(scope, payload,
resultSchema, work)` validates and persists the logical JSON result atomically.

- [ ] Tests assert `sameResult.id === firstResult.id` for concurrent same-key
      creates, changed payload → `IDEMPOTENCY_CONFLICT`, unauthorized replay denied,
      rollback removes business/idempotency/audit/outbox writes, and bounded retries
      do not replay external effects.
- [ ] Run `pnpm test:db -- test/database/transactions.db-spec.ts`; observe RED.
- [ ] Implement concrete helpers with canonical JSON hashing, typed JSON result
      parsing, native crypto, recognized transaction-conflict retries and explicit
      transactional audit/outbox writes. No arbitrary cross-domain CRUD abstraction.
- [ ] Run the DB test and typecheck; require GREEN.
- [ ] Commit `feat(SCRUM-14): make foundation mutations transactional and idempotent`.

### Task 3: Real JWT and fresh identity verification

**Files:** AuthModule/resolver/verifier; common access context/UUID boundary;
environment schema/examples; auth unit/HTTP/DB tests.

**Interfaces:** `SupabaseAccessContextResolver.authenticate(request)` returns a
verified `AuthenticatedUser` with UUID user/session, token expiry and verified
email. `resolveMembership(userId, workspaceId)` uses the real DB and active
workspace. Supabase managed auth data stays outside Prisma business models.

- [ ] Generate a real asymmetric test signing key/JWKS fixture. Assert valid
      verification; wrong key/algorithm/issuer/audience, missing/expired expiry,
      invalid subject/session, unverified/banned user and revoked session denied.
      Assert case-equivalent UUIDs authorize identically and network/DB failures
      expose no raw token, URL, key or stack.
- [ ] Run the auth tests and observe RED with the current deny-all resolver.
- [ ] Verify current Supabase docs, implement configured trusted verification,
      fresh account/session checks and safe failure handling. Keep role decisions
      in ACTIVE database membership. Define partial/missing configuration behavior.
- [ ] Run targeted auth unit/HTTP/DB tests and existing access guard tests.
- [ ] Commit `feat(SCRUM-12): verify Supabase identities and active tenant access`.

### Task 4: Profile and workspace APIs

**Files:** auth/profile DTO/service/controller; workspace DTO/service/controller;
module registrations; `test/database/workspaces.db-spec.ts`.

**Interfaces:** `ProfileService.bootstrap(identity, input)` persists trusted
identity; `WorkspaceService.create(identity, dto)` atomically creates workspace
and ADMIN membership; scoped list/detail/update use `WorkspaceActor`.

- [ ] Test idempotent profile sync, ignored client email/role injection, slug
      normalization/conflict, atomic first-admin creation, active-only listing,
      settings permissions and accurate scoped counts.
- [ ] Run the workspace DB/HTTP test and observe RED.
- [ ] Implement strict DTOs, mapped responses and OpenAPI using common helpers;
      handle concurrent duplicate creates and suspended workspaces explicitly.
- [ ] Run the DB/HTTP test and existing HTTP foundation suite; require GREEN.
- [ ] Commit `feat(SCRUM-12): persist profiles and secure workspace workflows`.

### Task 5: Membership and complete invitation workflow

**Files:** workspace membership/invitation services, DTOs/controllers;
`test/database/memberships.db-spec.ts`.

**Interfaces:** member list/role/deactivate and invitation create/list/revoke/
accept consume current identity/actor and Task 2 transactions. Tokens are issued
once, only hashes persist, and response projections never list token material.

- [ ] Test invite email verification/mismatch, expired/revoked/replayed token,
      concurrent acceptance, existing-member escalation denial and role matrix.
      Race two last-admin demotions; require at least one ACTIVE admin to remain.
      Revoke session/membership between guard and service; require safe denial.
- [ ] Observe RED with the membership DB/HTTP test.
- [ ] Implement transaction-safe operations, expiry, cryptographic token handling,
      explicit permission checks and safe responses. Issuing is not sending email.
- [ ] Run membership and workspace DB/HTTP tests; require GREEN.
- [ ] Commit `feat(SCRUM-12): enforce invitation and last-admin invariants`.

### Task 6: Customer/account producer services and APIs

**Files:** customer/billing services, projections, DTOs/controllers/modules;
`test/database/customers.db-spec.ts`.

**Interfaces:** `CustomerService` exposes scoped CRUD/account-context;
`BillingReadService` exposes payment/subscription/access projections consumed by
the Lead's existing read-tool contract. Every method consumes `WorkspaceActor`.

- [ ] Test cross-tenant item/count denial, blocked customer behavior, mismatched
      optional subscription/customer links, minor-unit/currency/period validation,
      stable pagination/filter bounds and no extra private fields in responses.
- [ ] Observe RED with the customer DB/HTTP test.
- [ ] Implement concrete services/DTOs, deterministic sorting and scope-safe
      projections. Demo setup writes use controlled tooling or explicit audited
      admin-only endpoints with a core consumer; no provider financial effect.
- [ ] Run customer and schema DB tests; require GREEN.
- [ ] Commit `feat(SCRUM-14): complete scoped customer and account foundations`.

### Task 7: Authenticated ticket workflows

**Files:** ticket state/domain service, DTOs/controller/module;
`test/database/tickets.db-spec.ts`.

**Interfaces:** `TicketService` exposes scoped create/list/detail/update/message/
assign/status operations. `TicketStateService` guards transitions; public
handlers cannot set workflow-owned execution states. Customer identity linking
requires an authenticated, audited verification action.

- [ ] Test ticket+message atomic creation, safe per-workspace references,
      filters/counts, message bounds/visibility, inactive or foreign assignee denial,
      guarded customer linking and forbidden manual EXECUTING/RESOLVED transitions.
- [ ] Observe RED with the ticket DB/HTTP test.
- [ ] Implement full authenticated ticket workflows, row/version concurrency,
      mapped responses, audit writes and bounded data retrieval.
- [ ] Run ticket, customer and role regression tests; require GREEN.
- [ ] Commit `feat(SCRUM-14): complete tenant-scoped ticket workflows`.

### Task 8: Public support intake and replay safety

**Files:** public ticket DTO/controller/service, abuse/token policy and config;
`test/database/public-intake.db-spec.ts`.

**Interfaces:** `PublicTicketService.create(slug, formContext, key, dto)` returns
201 with a safe receipt after ticket/message/idempotency commit. Untrusted
customer hints never become verified identity or private read authorization.

- [ ] Test unknown/suspended workspace, invalid/expired form checks, stricter
      abuse limits/origin behavior, unknown fields, safe receipt projection,
      same-key retry/race/lost-response behavior and changed-payload conflict.
      Assert spoofed requester email/ref reveals no account and grants no identity.
- [ ] Observe RED with the public-intake DB/HTTP test.
- [ ] Implement real persistence, native constant-time hash checking where
      applicable and durable replay; do not claim a public token is a secret login.
- [ ] Run public-intake plus ticket/role tests; require GREEN.
- [ ] Commit `feat(SCRUM-14): persist safe idempotent public ticket intake`.

### Task 9: Investigation lifecycle and step persistence

**Files:** `investigation.repository.ts`, module exports and typed inputs;
`test/database/investigations.db-spec.ts`.

**Interfaces:** repository `create/read/list/recordStep/transition/retry` consume
`WorkspaceActor` and typed inputs, use existing lifecycle contracts and return
mapped records. Queue execution is not registered or fabricated by this task.

- [ ] Test concurrent active-run admission, same-workspace wrong-ticket refs,
      sequence uniqueness, compare-and-swap transitions, terminal immutability,
      new-run retry lineage and revoked actor denial.
- [ ] Observe RED with the investigation DB test.
- [ ] Implement concrete typed persistence and transactional state/audit writes.
- [ ] Run investigation/schema/transaction tests; require GREEN.
- [ ] Commit `feat(SCRUM-14): persist guarded investigation runs and steps`.

### Task 10: Proposal revision, evidence and decision persistence

**Files:** `proposal.repository.ts`, module exports and typed inputs;
`test/database/proposals.db-spec.ts`.

**Interfaces:** repository methods persist/read versioned proposals/sources and
record exact-version decisions inside a caller-owned transaction. This does not
expose approval or bypass the later policy/action coordinator.

- [ ] Test strict structured payloads, null/LOW recommendations, immutable
      historical content/source snapshots, sequence/version uniqueness, concurrent
      edits, exact decision FK, stale/superseded revision and foreign actor denial.
- [ ] Observe RED with the proposal DB test.
- [ ] Implement schema-validated typed JSON persistence, atomic new revisions
      and guarded decision writes without fake action admission.
- [ ] Run proposal/investigation/transaction tests; require GREEN.
- [ ] Commit `feat(SCRUM-20): persist immutable proposals sources and decisions`.

### Task 11: Repeatable fixtures and operational documentation

**Files:** `prisma/seed.ts`, seed/configuration scripts, `.env.example`, module
READMEs and Step 2 verification/setup/migration docs; fixture DB tests.

**Interfaces:** seed consumes explicit authorized workspace/user IDs and target
mode, supplies three synthetic account/ticket cases plus PixelDesk, and is
repeatable without touching unrelated tenants or managed Auth account data.

- [ ] Test repeated setup, reference/counter stability, isolated second workspace,
      no password/key output and refusal of destructive/shared reset defaults.
- [ ] Observe RED with the fixture DB test.
- [ ] Implement scoped setup and document Supabase verification/password-reset
      handoff, required grants/session read access, safe migrations and remaining
      live integration prerequisites. KB/provider fixtures remain their later step.
- [ ] Run fixture and full DB suites; require GREEN.
- [ ] Commit `docs(SCRUM-14): deliver repeatable fixtures and foundation runbooks`.

### Task 12: Whole-branch verification, review and delivery

**Files:** regression tests only where new findings require them; final evidence
and current numbered-step status.

**Interfaces:** consumes all previous modules, spec, plan and execution ledger;
produces verified backend code and PR/commit evidence on `testing`.

- [ ] Run `pnpm check` and the complete `pnpm test:db` against empty/disposable DB;
      inspect all output and verify default suites never mutate the shared DB.
- [ ] Dispatch one fresh whole-branch review, including the Review Focus above.
      Fix material findings with a reproducing RED → GREEN test; rerun affected and
      full checks. Record material rulings and remaining verified limitations.
- [ ] Push the feature branch, create its PR targeting `testing`, merge after
      applicable checks and verify the remote merged SHA and clean checkout.
- [ ] Update only Lead Jira items with exact implemented/verified slices and
      links. Do not close entire proposal/approval tasks on persistence alone.
- [ ] Report meaningful commits, test evidence, remaining shared/live setup and
      the next numbered step; do not automatically start Step 3.
