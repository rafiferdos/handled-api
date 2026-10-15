# Step 1 verification — 15 October 2026

Branch: `feat/SCRUM-11-lead-api-contracts`. Base: `origin/main` at `6f64a12`.
Scope: [Lead contract authoring](lead-contracts.md), corresponding to Step 1 of
the [backend sequence](team-lead-steps.md).

## Results

Runtime: Node **22.23.3**, pnpm **11.25.0**, existing frozen dependency versions.

| Verification                  | Result                                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm check`                  | Passed: formatting, type-aware lint, strict typecheck, unit tests, HTTP E2E and production build |
| Unit suite                    | **111 passed across 10 files**; 75 cases added beyond the 36-test starter                        |
| HTTP E2E suite                | **37 passed across 3 files**; 9 cases added beyond the 28-test starter                           |
| `git diff --check`            | Passed                                                                                           |
| Production registration check | Contract fixture routes do not appear in the shipped application's OpenAPI                       |

The required `pnpm check` ran outside the filesystem/network sandbox so Supertest
could bind localhost. Tests use isolated database/identity doubles; no shared DB
mutation, live provider call or real worker/action execution was performed.
The logged `DEPENDENCY_UNAVAILABLE` 503 is the existing intentional readiness
failure fixture, not a failed check.

## What the checks establish

- Model/action schemas reject unknown actions, extra authority/payload keys,
  invalid money/version types, blank/oversized text and inconsistent outputs.
- Evidence references cannot be duplicated or mutated after proposal parsing;
  version/hash metadata is required for typed source snapshots.
- Five read-only tool argument schemas reject write tools and scope/filter
  expansion; retrieval bounds and timezone-aware payment ranges are checked.
- HTTP contract fixtures verify expectedVersion strictness, empty triggers,
  nested action validation, idempotency header admission, safe error envelopes,
  request correlation, read/write roles and workspace denial using the common
  guard with an explicitly fake identity resolver.
- OpenAPI documents the versioned requests, action unions including null,
  response/list envelopes, bearer scheme and grouped conflict examples. Runtime
  immutability does not accidentally make editable request fields read-only.

## Review and later work

This establishes the Step 1 authoring implementation and transport/structural
validation. It does not establish real JWT/ACTIVE membership, actual source truth,
DB tenant constraints, queue durability, action idempotency or G1/golden-flow
completion. Peer and A/B/C/D consumer reviews are pending; see the explicit
decisions and producer review matrix in the contract guide.

Step 2 remains unstarted. At the audited baseline, A's identity/workspace and B's
customer/ticket parent models are comments only. Recheck them when Step 2 is
requested and pause at any missing parent/producer rather than creating it in
the Lead's domain.
