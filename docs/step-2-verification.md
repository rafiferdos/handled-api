# Step 2 backend foundation verification

Date: **17 October 2026**. Scope: the approved solo backend Step 2 and its real
Auth/Workspace/Customer/Ticket dependencies. Frontend is deferred.
Delivery: [foundation PR #4, targeting testing](https://github.com/rafiferdos/handled-api/pull/4).
GitHub records the integration result and merge SHA. No shared Supabase migration,
role/account change or hosting deployment was executed by this delivery.

## Implemented and locally verified

- Private 18-table Prisma schema, four migrations, scoped composite foreign keys,
  null/parent/version/money checks, active/current partial unique indexes,
  last-admin protection, immutable history and deny-by-default browser RLS.
- Asymmetric JWT/JWKS verification, current managed identity/session checks,
  profiles, workspaces, active membership, invitations and role/deactivation.
- Customer/account reads, ticket/messages/assignment/customer verification/manual
  closure and guarded durable public intake with safe receipts.
- Investigation run/step lifecycle and retry lineage; immutable proposal/source
  revisions and exact-version decision persistence. Sensitive caller-owned writes
  require `IdentityTransaction` from `UnitOfWork.runAs`.
- Repeatable AcmeCloud canonical cases and a separate PixelDesk admin/customer/
  ticket namespace. Scoped seed preserves changed business records and counters.

Source verification at `c83d2f9` on Node 22.23.3 / pnpm 11.25.0:

| Check                                                           | Evidence                                                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                    | PASS: format, lint, types, 125 unit tests (12 files), 37 isolated HTTP tests (3 files), production build |
| Four migrations from an empty disposable PostgreSQL 18 instance | PASS; no shared target used                                                                              |
| Final `pnpm test:db`                                            | PASS: 61 real DB/signed HTTP/concurrency tests (15 files)                                                |
| Scoped seed TypeScript build and compiled CLI                   | PASS; positive CLI path twice, three canonical tickets once                                              |
| Implicit seed mode                                              | Refused before database connection; generic credential-free failure                                      |
| `git diff --check`                                              | PASS                                                                                                     |

The DB suite uses explicit loopback `handled_test` only; its minimal managed-Auth
column fixture is not a hosted Supabase sign-up/logout integration test. See the
[setup/runbook](backend-foundation-setup.md) for target grants, security, API use,
fixture configuration and remaining live prerequisites.

## Independent review and corrections

A fresh read-only reviewer inspected all 110 changed files at `a7dfbf4` across
schema, authorization, workflows, repositories, tests and operations. It found
two Important authorization races, with no additional Critical or Minor findings.
Both were reproduced before correction and fixed in `c83d2f9`:

1. A Serializable snapshot taken before waiting on an unchanged workspace row
   could retain a demoted role or a newly blocked customer's previous state.
   Transactions now take current ReadCommitted reads under the workspace lock,
   with existing CAS/SQL constraints; acceptance reloads the invite after locking.
2. JWT/session timeboxes could expire during a contested lock. Identity is
   rechecked after that wait and before commit. Caller-owned repository writes
   use an identity-bound transaction; expiry rolls back already-written decisions.
   Durable receipt paths also recheck authorization before returning/committing.

Coordinated tests cover AGENT-to-VIEWER demotion, customer blocking, invite
revocation and creator demotion, JWT/session expiry for customer creation and
invite acceptance, and decision rollback after callback-time expiry. The first
four failing races were observed RED, then GREEN; the full suite passed after
fixing. No second review or invented human approval is claimed.

## Rulings made during implementation

| Decision                                                                                      | Why                                                                  | Cost if the choice changes                                                    |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| One final decision per immutable proposal revision                                            | Prevent contradictory final outcomes; edits have a new revision UUID | Supporting multiple final outcomes needs an explicit schema/contract change   |
| Four closed shared ticket categories                                                          | Match the three supported action families plus OTHER/manual review   | New categories require a reviewed enum/DTO migration                          |
| Private identity lookup with fixed-path SECURITY DEFINER and revoked browser/PUBLIC execution | Retain Auth locks without runtime Auth UPDATE grants                 | Function-owner privileges and target EXECUTE grants need operational review   |
| ReadCommitted under workspace locks, CAS and SQL constraints                                  | Avoid stale authority/eligibility after lock waits                   | Every new scoped writer must preserve the ordering or prove its own invariant |
| Identity-bound caller transactions with precommit revalidation                                | Expiry must roll back domain, decision, audit and outbox writes      | Future coordinators must use `runAs`, not an unguarded transaction            |

## Review scope rulings

Each behavior the reviewer declined was assessed explicitly; none is silently
counted as completed. These boundaries stand under the accepted numbered scope:

| Behavior                                                        | Ruling and cost if incorrect                                                                                                           |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted Auth, function ownership/grants, Data API exposure       | Target verification remains required; deployment may be blocked by differing target configuration                                      |
| Frontend sign-up/confirmation/reset/logout                      | Deferred frontend scope; browser Auth is not proven now                                                                                |
| Invitation email                                                | Issuing is implemented, delivery unconfigured; manual token handoff remains necessary                                                  |
| Queue/worker/actual AI                                          | Later Steps 3/4/7; no executed async investigation is claimed                                                                          |
| KB retrieval/source truth                                       | Later Steps 5/6/8; validated stored snapshots do not establish factual source provenance                                               |
| Current-ticket/run policy and atomic action admission/execution | Later Step 9; internal decision persistence cannot be exposed as an approval shortcut                                                  |
| Commercial billing/connectors/real financial effects            | Outside this MVP; future scope needs a separate design                                                                                 |
| Reverse-proxy client IP and external spam challenges            | Deployment gate; hosted IP/rate behavior still needs validation                                                                        |
| Message client-key deduplication                                | Not promised by this API; repeated message POSTs can append duplicates                                                                 |
| More account-history endpoints                                  | Bounded aggregation with counts is accepted; history beyond 50/type needs a later paged producer before complete-history claims        |
| Expanded manual states/public Lead orchestration                | Later workflow steps; current human status API supplies allowed closure only                                                           |
| VIEWER reading internal notes                                   | Authenticated workspace readers receive timeline access; a stricter internal-note policy would need an explicit role/visibility change |
| DB-owner/arbitrary SQL bypass                                   | Privileged operations remain an operational boundary; server credentials and managed grants must stay protected                        |

No minor review findings were deferred. Step 3 (durable queues/outbox dispatch)
is the next numbered backend step and was not automatically started.
