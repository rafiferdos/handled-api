# Backend core flows implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Native execution in the current checkout is the requester's existing choice.

**Goal:** Complete the required backend processing path after Step 2, with explicit live-provider and hosting acceptance limits.

**Architecture:** Durable DB intents drive BullMQ. Separate, injected domain handlers use scoped transactions, versioned evidence and explicit human approval. A standalone worker runs indexing, investigation and simulated actions; authorized REST polling recovers state.

**Tech Stack:** Existing Node 22.23.3, pnpm 11.25.0, NestJS 12, Prisma 7, TypeScript 6, Zod, installed BullMQ/ioredis/Google GenAI, PostgreSQL with pgvector.

**Spec:** `docs/superpowers/specs/2026-10-17-backend-core-flows-design.md`

## Global constraints

- Backend only; preserve strict tenant scope, native types and existing HTTP contracts.
- No external writes, shared DB reset, deployment, frontend or production action adapter.
- All action effects are simulated external effects with real transactional business-row changes.
- Provider models come from explicit environment configuration; never fabricate provider success.
- Keep read-only external calls outside DB retry callbacks and recheck authority at commit.
- Push feature branch, PR to `testing`, verify and merge; update only Lead Jira.
- Record routine rulings and verification evidence; user delegated implementation choices.

## Review focus

- A stale worker finishing after lease loss must not publish a proposal or apply an effect.
- Policy archive/republish and membership revocation during external calls must block commit.
- Redis loss or acknowledgement loss must retain work without duplicate business effects.
- Model-selected customer/tool/citation and target refs must never expand server scope.
- A human edit must not launder stale evidence, LOW confidence or unrelated policy into approval.

### Task 1: Durable outbox and worker runtime

**Files:** `src/modules/queue/{job-contracts,outbox-dispatcher,queue-runtime}.ts`, `src/worker.ts`, `test/database/queue.db-spec.ts`.

**Interfaces:** Produce `enqueueJob(tx, workspaceId, kind, aggregateId, requestId)` and `JobRegistry.register(kind, handler)`, handlers receive canonical DB intent and fenced completion callback. Existing `OutboxEvent` is the source.

- [ ] Add failing tests: mismatched tenant payload denied; Redis failure leaves pending intent; duplicate handler completion is harmless; expired lease can recover.
- [ ] Run targeted test, expect missing implementation failure.
- [ ] Implement bounded DB claims, retry/backoff, UUID job IDs, independent API/worker lifecycle and shutdown.
- [ ] Run targeted tests, expect all pass; commit meaningful slices.

### Task 2: Versioned knowledge and action schema

**Files:** `prisma/models/{knowledge,operations,identity,ai,ticket}.prisma`, new generated migration; `test/database/core-schema.db-spec.ts`.

**Interfaces:** Produce KnowledgeDocument/Revision/Chunk, ActionExecution and composite scope/version FKs; lease/fencing metadata belongs to durable queue records.

- [ ] Add failing DB tests for cross-workspace relations, immutable revisions, vector dimensions and duplicate action decisions.
- [ ] Run tests, expect missing tables/constraints.
- [ ] Add schema/migration with private RLS/default deny, indexes, immutable history and action snapshots.
- [ ] Deploy to empty disposable DB with pgvector; run tests; commit.

### Task 3: Bounded provider adapter

**Files:** `src/modules/ai/{ai-provider,gemini-provider,provider.config,provider.schemas}.ts`, provider tests.

**Interfaces:** `AiProvider.classify`, `planTools`, `recommend`, `reply`, `embed`; normalized usage/error metadata and cancellation signal. Injectable symbol permits external-boundary test double.

- [ ] Tests pin malformed output, missing configuration, unsupported tool, deadline and invalid/nonfinite/zero 768-vector behavior.
- [ ] Run RED; implement official SDK adapter with bounded retries/calls and no raw logging; run GREEN.
- [ ] Commit; note real provider verification unavailable without config.

### Task 4: Knowledge lifecycle and retrieval

**Files:** `src/modules/knowledge/{knowledge.service,knowledge.controller,knowledge.dto,knowledge-indexer,chunking}.ts`; DB/HTTP tests.

**Interfaces:** `KnowledgeService.search(workspaceId, query, topK)` returns current published scoped sources; indexer consumes durable knowledge job; writes staged embeddings only after version revalidation.

- [ ] RED: draft never retrieved, archive/republish during embedding blocks stale publication, foreign sources denied, reindex replaces atomically.
- [ ] Implement CRUD/publish/archive/reindex, immutable revisions, typed raw vector bridge and bounded chunking.
- [ ] GREEN with actual pgvector; commit.

### Task 5: Scoped tools and evidence policy

**Files:** `src/modules/ai/{read-tools,evidence-policy}.ts`; real DB/unit tests.

**Interfaces:** `ReadTools.execute(context, call)` consumes reviewed five tool schemas and concrete account producers. Return sanitized data, immutable sources, missing facts.

- [ ] RED: wrong customer/workspace/tool denied; capped history and ambiguous active subscriptions force missing facts; invented/stale citations rejected.
- [ ] Implement canonical source hashing, no arbitrary SQL/HTTP/tool writes, current policy validation and LOW/manual fallback.
- [ ] GREEN; commit.

### Task 6: Investigation API and pipeline

**Files:** `src/modules/investigation/{investigation.service,investigation.controller,investigation-processor}.ts`, module wiring, DB/HTTP tests.

**Interfaces:** Admission uses existing `InvestigationRepository.createInTransaction` in `UnitOfWork.runAs`; processor uses provider/tools and fenced finalization; status/list/detail/proposal reads preserve DTOs.

- [ ] RED: concurrent admission creates one run; revoked origin or changed ticket/customer/lease prevents proposal; provider failures become safe persisted terminal state.
- [ ] Implement trigger/retry/status/list, classification/read-tool loop/RAG/recommend/reply stages, provenance resolution and proposal commit.
- [ ] GREEN actual DB with injected provider; commit.

### Task 7: Human decisions and simulated action admission

**Files:** `src/modules/proposal/{proposal.service,proposal.controller}.ts`, `src/modules/action/{action-policy,action.service,action.dto}.ts`; DB/HTTP tests.

**Interfaces:** `ActionPolicy.validate(tx, workspaceId, proposalId)` returns server-resolved target/precondition snapshot. Approval composes exact decision/action/outbox in one identity-bound transaction.

- [ ] RED: two approvals create one action; viewer/unverified/LOW/stale run/policy/citation/edit denied; changed idempotent payload conflicts.
- [ ] Implement edit/approve/reject/escalate, current policy/evidence/target validation and latest-run/ticket checks.
- [ ] GREEN; commit.

### Task 8: Action execution and recovery

**Files:** `src/modules/action/{action-processor,action.controller}.ts`; golden/race DB tests.

**Interfaces:** Queued execution loads approved decision and current human authority, validates policy under workspace lock and changes target/audit/status atomically. ADMIN retry/reconcile use fresh authority.

- [ ] RED: each golden effect once under duplicate/concurrent delivery; cancellation preserves end/access; wrong product, role revoked or policy archived denied; unknown outcome never blindly retries.
- [ ] Implement three simulated effect branches, before/after history, failure/retry/reconciliation and bounded reads.
- [ ] GREEN; commit.

### Task 9: Audit, polling, analytics and evaluation

**Files:** `src/modules/audit/{audit.controller,audit.service}.ts`, analytics controller/service/DTO; `src/modules/evaluation/` corpus/scoring/runner; scripts/docs.

**Interfaces:** Authenticated scoped REST is the durable refresh contract. Evaluation uses the same provider/policy pipeline and records measured results only for actual invocation.

- [ ] RED: foreign counts/history denied, polling returns committed status after worker restart, negative corpus has at least 10 cases and each golden action is scored independently.
- [ ] Implement bounded history/DB-derived analytics, versioned 20+ corpus, opt-in evaluator and provider capability probe.
- [ ] GREEN; commit.

### Task 10: Assembled verification and delivery

**Files:** golden-flow/concurrency tests, operational runbook, verification record, roadmap/env/README.

**Interfaces:** Review all cross-module contracts and record remaining live acceptance.

- [ ] Exercise actual Redis worker, outage/recovery/restart and database migrations from empty; full `pnpm check` and DB suite.
- [ ] Request one fresh-context final whole-branch review; reproduce/fix Important findings with RED/GREEN evidence.
- [ ] Document source/serving/provider distinctions, immutable-history and retention tradeoffs, setup and recovery commands.
- [ ] Push feature branch, open PR into `testing`, verify checks, merge and read back; only Lead Jira updates with evidence.
