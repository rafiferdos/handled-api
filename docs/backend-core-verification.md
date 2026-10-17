# Backend core verification

**17 October 2026.** Feature branch `feat/SCRUM-17-backend-core-flows`, based on
`testing` at `2f65c078da70a1b038669e170df84412923c2968` (Step 2 PR #4).
The [implementation plan](superpowers/plans/2026-10-17-backend-core-flows.md)
delivers the connected backend core for roadmap Steps 3–12. See the
[setup/recovery guide](backend-core-setup.md) and [short Gemini guide](gemini-quickstart.md).

Final application/test code: `8bca3ec` (documentation follows). Commands ran
with Node **22.23.3** and pnpm **11.25.0** on the tree being delivered:

| Check                                                 | Result                                                                |
| ----------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm check`                                          | Format, type-aware lint, strict typecheck and production build passed |
| Unit suite within `check`                             | **139 tests**, 16 files passed                                        |
| Isolated HTTP/OpenAPI suite within `check`            | **37 tests**, 3 files passed                                          |
| Empty-DB `pnpm test:db` with explicit local Redis URL | **92 tests**, 25 files passed; all five migrations applied from empty |
| Combined test count                                   | **268 passed**; no skipped DB/Redis file in this run                  |

The final DB target was disposable `handled_test` on `127.0.0.1:55433`, using
`pgvector/pgvector:pg18`; Redis was `redis:8-alpine` on `127.0.0.1:56379`, DB 15.
Both were local containers owned by this test run. The final DB suite took
30 seconds. The final HTTP suite emitted the expected sanitized 503 fixture
event with errorCode/requestId/traceId, without raw dependency details.

Reproduce using the explicit test command in the core guide. Provider credentials
were not present during these checks. Delivery PR:
[backend core #5](https://github.com/rafiferdos/handled-api/pull/5), targeting
**`testing`**. GitHub retains the current PR/merge state; the merge does not deploy
the application or apply shared migrations. Local test evidence is recorded above.

## Verification boundaries

- Unit/isolated HTTP checks validate strict schemas, OpenAPI, provider protocol,
  cancellation, evidence policy and safe errors without shared dependencies.
- Disposable PostgreSQL with pgvector validates actual migrations, relations,
  RLS/private-role behavior, domain transactions, concurrency and persisted effects.
- Three golden HTTP flows create public tickets, verify customers, admit real
  investigations, resolve scoped vector evidence, record human approvals and
  read actual simulated business effects/audit. The external AI boundary uses
  an injected deterministic provider; production has no fake provider fallback.
- Actual Redis/BullMQ tests cover connection refusal, worker restart, durable
  intent recovery, one effect and backlog backpressure. Other domain tests drive
  the production dispatcher/processors directly; they are not hosted acceptance.
- The local Gemini key is absent. No live generation, real provider embedding,
  measured AI accuracy or deployed golden flow is claimed. The user will add
  the key; configuration, capability probe and benchmark are prepared.
- Shared Supabase migrations/grants and deployment were not performed.

## Independent review and reproduced fixes

One independent whole-branch review examined `2f65c07..bbbfede`. It raised two
Important findings and no Critical or Minor findings. Both were reproduced as
failing tests before production fixes in `f13a1e0`:

1. **Healthy queued work spent retries before execution.** Twenty leased intents
   could wait behind worker concurrency while their 60-second DB leases expired.
   Dispatch now checks active/waiting/delayed/prioritized Redis counts and claims
   only available capacity. A real Redis regression holds one worker busy and
   verifies the remaining seven jobs retain zero attempts and never fail.
2. **Concurrent same-token redelivery could fail a healthy investigation.** Two
   handlers could enter external work and advance the ticket snapshot together.
   An atomic one-time delivery-token exchange now gives one handler the execution
   lease. The regression concurrently redelivers during a blocked provider call
   and verifies one provider entry with the expected review outcome. Release and
   completion remain token-fenced.

The targeted queue/pipeline/Redis suite then passed **9 tests**. Final full-suite
results are recorded below. No second review cycle or claim of post-fix reviewer
approval is made. The implementer also found missing evaluation token reporting;
a RED/GREEN test now proves per-stage usage survives a later provider failure
without exposing raw error text.

## Decisions and their costs

This table preserves the execution ledger and the reviewer's declined behaviors.
These are deliberate scope/operation choices, not hidden successful acceptance.

| Decision                                                                      | Reason                                                                                                                     | Cost / remaining work                                                                                         |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Execute the connected core batch in this checkout                             | User approved the solo design, native execution and subsequent multi-step implementation                                   | Larger review surface; bounded by focused commits, regression suites and final independent review             |
| Preserve domain folders and implement A/B/C/D dependencies                    | User now works solo; waiting for former owners is superseded                                                               | Team-owner sign-off is not implied; only Lead Jira receives updates                                           |
| PR into `testing`, then merge                                                 | Explicit standing user instruction                                                                                         | Code integration does not apply shared migrations or deploy                                                   |
| REST polling instead of Socket push                                           | Approved roadmap permits polling recovery                                                                                  | No push notifications; hosted reconnect/continuity proof remains                                              |
| Approval alone requires an idempotency header; active-run admission coalesces | Runtime uses one active run and immutable expected-version decisions instead of Step 1's proposed header on every mutation | Repeated stale edits/rejects conflict rather than replaying; clients must use the current documented contract |
| Outbox UUID plus fresh claim UUID in Redis job IDs                            | Expired claims must not be suppressed by retained jobs                                                                     | Database execution tokens/transactions, rather than Redis dedup, guarantee effects                            |
| Limit dispatch to available capacity                                          | Review reproduced healthy backlog retry exhaustion                                                                         | Conservatively counts shared queue load; multiple workers may underutilize capacity                           |
| Any current published denial blocks an action                                 | Structured policy conflicts must fail closed                                                                               | ADMIN must reconcile contradictory policies                                                                   |
| `OUTCOME_UNKNOWN` reports current state and manual review                     | Target state alone cannot prove command causality; current effects are atomic DB changes                                   | Imported/inconsistent unknown outcomes require an operator; no automatic success inference                    |
| Provider-only synthetic benchmark with limited reply checks                   | Versioned capability scoring is useful before optional quality-center work                                                 | No persisted eval history/API, no integrated benchmark effects, and human semantic grading remains necessary  |
| Report observed successful-stage tokens only                                  | Current adapter does not expose embedding or failed-attempt token usage                                                    | Metrics are incomplete billing data; use provider billing for total cost                                      |
| Configure Gemini, keep key blank                                              | User selected Gemini and will add the secret later; official protocol was checked                                          | Live compatibility, accuracy and actual policy retrieval remain unverified                                    |
| Leave shared extension placement, grants and deployment untouched             | Outside this code/local-test delivery; target-specific review is required                                                  | Operations/hosted acceptance remains pending                                                                  |
| Keep external actions and message delivery simulated/outside scope            | MVP authorizes human-approved simulated DB effects, no production connector                                                | No real refund, external cancellation or customer-message delivery proof                                      |
| Preserve immutable evidence/history without automatic deletion                | Auditability and exact-version decisions are required                                                                      | Storage grows; target retention/archive/restore procedure must be reviewed                                    |
| Run socket tests with sandbox escalation                                      | Local socket binding is blocked under the default sandbox                                                                  | Initial EPERM run was environmental; only the properly permitted run counts                                   |

The reviewer explicitly declined to judge key-backed Gemini behavior, shared
Supabase/deployment, production external actions/message delivery, optional
persisted evaluation/semantic reply grading, push notifications and automatic
imported-unknown resolution. The corresponding rulings above retain those
limits. **No Minor findings were deferred.**

## Remaining release gates

1. Add `GEMINI_API_KEY` and the actual Redis connection; run `pnpm ai:probe`.
2. Review/apply the complete migration and trusted runtime grants on the chosen
   target. Publish/index the three policies using actual embeddings.
3. Run and retain the 22-case key-backed evaluation; inspect failures and replies.
4. Prove continuous worker operation, restart/retry and DB/Redis/provider access
   on the serving host (ADR-012). Review backup/restore and target RLS exposure.
5. Run the three deployed public-intake → authenticated investigation → actual
   AI/RAG → human decision → simulated effect → persisted audit flows.

These are acceptance gates, beyond cosmetic refinement. Frontend integration and
browser product acceptance follow separately. Optional knowledge-gap drafting,
persisted quality-center history, advanced analytics and real external adapters
are outside this core delivery.
