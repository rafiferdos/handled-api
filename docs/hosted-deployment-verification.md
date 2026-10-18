# Free hosted deployment verification

Verified **18 October 2026 (Asia/Dhaka)** through the hosted UI, API, database,
queue worker and real Gemini provider. Customers/data are synthetic; external
business effects remain simulated.

## Original acceptance code and resources

| Component          | Verified deployment                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend           | [Handled](https://handled-rafiferdos.vercel.app), Vercel Hobby; `dpl_Bb3oWjXPFAhELjH16DEEwuVK9iHU`, commit `83655c168e020f74202472bd88cad3a5b5d10992`, production READY |
| Backend            | `https://handled-api-zv4h.onrender.com/api/v1`, Render Free/Singapore, service `srv-db8gpj0m7kps73fq20ag`                                                               |
| Backend deployment | `dep-dba9f5eq1p3s73ar399g`, live; `testing` commit `51943d71a1a9adf41ef23042479eaaeb280b0736`                                                                           |
| Queue              | Free Key Value `red-db9t72vbtjjs73cvr4o0`; noeviction, persistence off, external IP allowlist empty                                                                     |
| Database/Auth      | Existing Supabase project `ljtcdfyajgwqbbuntwoc`                                                                                                                        |
| AI                 | Real `gemini-3.5-flash-lite`, prompt `handled-core-v2`, LOW thinking; `gemini-embedding-2`, 768 dimensions                                                              |

The API and BullMQ worker remain separate supervised Node processes in one Free
web service. No paid plan, compute upgrade, extra managed database or provider
billing was activated. Backend PRs [11](https://github.com/rafiferdos/handled-api/pull/11),
[12](https://github.com/rafiferdos/handled-api/pull/12) and
[13](https://github.com/rafiferdos/handled-api/pull/13) merged into `testing`.
Backend `development` and its pending PRs were left unchanged.

## Browser: public request through saved outcome

The actual [support form](https://handled-rafiferdos.vercel.app/support/acme-cloud-301fad4d)
was submitted without login. Receipt **TKT-1004**, ticket
`b9e0ca12-6497-43a1-a666-2e1bd4926878`, belongs to AcmeCloud Browser Lab
(`301fad4d-0a09-4220-9a53-03b98679f34f`). Browser login and explicit customer
verification linked the request to synthetic Maya Rahman / CUS-1001.

Three published policies reached index READY through the hosted worker and real
embedding provider. The final browser investigation recorded real classification,
customer/payment/subscription tools, RAG and cited recommendation/reply generation.
It cited the verified customer, published refund policy and both settled payments,
recommending `PAY-9002` for 2900 USD minor units. AI content was not edited to pass.

Human approval was submitted through the UI. Action
`54b02b30-aa0f-4be4-9d6d-33677b06b34a` reached **SUCCEEDED**, simulation true,
one attempt. Saved state changed SETTLED to REFUNDED, version 1 to 2; a fresh
account-context request confirmed the payment mutation. Browser reload restored
the correct workspace and refetched the RESOLVED ticket, approved proposal,
saved result and `action.completed` audit. Timeline retains the prior rejection
and both investigations.

## Three independent hosted API cases

The checked-in `pnpm acceptance:hosted` probe completed all three cases in
AcmeCloud API Lab (`58845327-5fa7-441e-ac0a-3415d3c0841a`) using real HTTP,
Auth, hosted workers, Gemini/RAG and database refetches.

| Case                    | Ticket                                 | Investigation                          | Action                                 | Persisted effect                              |
| ----------------------- | -------------------------------------- | -------------------------------------- | -------------------------------------- | --------------------------------------------- |
| Duplicate refund        | `488e871d-c2a2-46d6-b456-076cd72b8945` | `df942895-d689-489d-b2e4-19c5925f83b1` | `50db7cf2-be85-4017-a76f-93b3e49008bb` | Payment REFUNDED                              |
| Period-end cancellation | `9b2e6c15-6938-4627-a5b3-cd3d2675c047` | `a4450711-0978-4152-adbb-dc22721b9f55` | `67c6329a-c3de-4e0d-a46e-cb997b515ee3` | cancelAtPeriodEnd true; paid period unchanged |
| Access restoration      | `d01f98e4-038e-4c21-ad97-c657027c6067` | `0d9c02f2-715b-4d28-80cd-87e23d2af2f2` | `1cd0c181-5c34-4533-815b-4686e5522c72` | Product access ACTIVE                         |

Every action succeeded at attempt 1 with simulation true. Every ticket refetched
as RESOLVED with one action and a persisted completion audit. Each case verified:

- Same public request/key replay returns the same ticket; changed payload returns 409. Investigation before explicit customer verification returns 422.
- Stale approval returns 409; repeated approval with the original key returns the
  same action ID, including after execution.
- Retrying a successful action returns 409. Foreign-tenant reads return 403/404;
  looking up an action under the foreign workspace returns 404.
- A fresh account-context read confirms the saved simulated business effect.

## Session and public intake

Deployed frontend checks passed password login, two HttpOnly/Secure/SameSite=Lax
cookies, one refresh after invalid access, account switch exposing only the new
account's workspaces, cross-tenant gateway denial, and logout renewing/revoking
the session and clearing cookies. Session/private gateway reads then return 401.
Anonymous private and cross-origin session/intake requests are denied;
responses use private/no-store. The viewer can read a proposal but cannot approve;
a foreign user cannot read the browser action.

Public intake is **enabled only for the exact origin**
`https://handled-rafiferdos.vercel.app`. Form tokens and the proxy HMAC secret are
server-only. Vercel's authoritative client IP is signed with origin, slug and
timestamp; Express does not globally trust forwarded headers. Real negative
requests all returned 403 for lookalike origin, missing token, missing/forged/stale
attestation and spoofed forwarded IP. Receipts grant no private read or identity.

Synthetic form tokens expire **25 October 2026, 02:35 UTC**. Before expiry, an
administrator must issue replacements and update the server-only Vercel mapping
together. Never put tokens in public URLs or code.

## Failures found and fixed

An initial real provider output invented an unsupported refund discriminator.
Outgoing Gemini JSON schema now converts const to a singleton enum; strict
application validation still rejects unsupported actions. That failed run was
preserved. A deliberate retry created a new run; duplicate retry returned the same
active run ID.

Another recommendation omitted mandatory customer evidence and used an internal
payment UUID as a refund target. Approval correctly returned 422 with no action;
the proposal was explicitly rejected. Investigations now always observe the
verified customer through the authorized tool, downgrade uncited customer facts,
and specify each action's exact external/UUID target contract. Existing approval
and execution checks remain enforced. Fresh browser/API runs passed after deploy.

Frontend fixes persist tenant selection per account/tab, clear private queries on
workspace/account changes, show approval errors inside the dialog and allow a
fresh investigation after rejection. Existing UI and architecture are preserved.

## Source verification and limits

Node 22.23.3 / pnpm 11.25.0 checks passed backend formatting, types, lint, **165
unit/process + 37 HTTP tests**, build and **93 disposable local Postgres/Redis
integration tests**. One pre-existing unused-import warning remains. Frontend
monorepo check passed lint, types, **39 web + 111 embedded API tests** and both
builds. Independent review found no actionable issue in the schema, grounding,
workspace-selection or rejection-recovery fixes. These are separate evidence
from hosted business execution.

All five reviewed migrations, 22 business tables, vector and restricted runtime
identity function were previously verified. Runtime has no direct managed-Auth
table access or postgres membership; browser roles have no business-table grants.
Earlier no-op outbox jobs proved initial delivery and recovery of a deliberately
expired lease; they do not prove real Redis data loss.

Remaining limits:

- Render Free sleeps both processes after 15 idle minutes. Controlled idle/wake
  and in-flight restart tests are unperformed; no continuous worker guarantee.
- Free Redis is volatile. Actual data-loss recovery and duplicate-effect safety
  across that event have not been demonstrated.
- Free Gemini quota is finite. The original 3.8 model hit its daily Free quota;
  final runs used available 3.5 Flash-Lite Free quota, with no paid fallback.
- No real refund, subscription-provider change, product-system write or outbound
  reply delivery was tested. Signup/password recovery are administrator managed.
- Connected tools do not expose account-wide billing controls. Resource plans
  stayed Free/Hobby; this is not an account-wide zero-charge guarantee.

See [the rollout guide](render-deployment.md) for operation and secret handling.

## No-action follow-up after reused fixture failures

Later manual testing reused API Lab's already-refunded payment and already-active
access. Real provider reproduction returned a valid null recommendation with
HIGH confidence that no work remained. The strict domain schema requires null
recommendations to have LOW confidence, so this semantic mismatch appeared as
AI_PROVIDER_ERROR. It was not a failed login, sleeping host or provider outage in
these reproductions.

[PR #15](https://github.com/rafiferdos/handled-api/pull/15) keeps structural,
action, parameter, citation and domain checks, conservatively downgrading null
recommendations to LOW/manual review. It never promotes or invents an action.
Regression tests failed before the fix and passed afterward; full check passed
171 unit/process + 37 HTTP tests and build. Independent review found no issues.

Render deployment `dep-dbaaa2ijnfac73ev8c50` went live at
`2026-10-18T10:54:55Z` on application commit
`984ac512cf8fccca1fce5514cd68cff1d86cd56f`; generation remains Free
gemini-3.5-flash-lite with prompt handled-core-v3 and ACTION_SIMULATION=true.
After the old worker drain window, actual hosted REST checks confirmed:

| Reused case              | New investigation                      | Result                                                                           |
| ------------------------ | -------------------------------------- | -------------------------------------------------------------------------------- |
| Already-refunded payment | `f991ed8e-c361-40fb-8931-789769d92099` | NEEDS_REVIEW, no failure code, LOW/null, zero actions, unchanged account context |
| Already-active access    | `7b21b7ef-2ed9-44d7-8450-9f678ad08d8d` | NEEDS_REVIEW, no failure code, LOW/null, zero actions, unchanged account context |

Chrome refetch of TKT-1001 showed Needs review, the explanation that PAY-9002 was
already refunded, and disabled approval. Prior failures remain in saved history.
The positive browser/three-case API acceptance above remains pinned to its
original deployment; this follow-up verifies the no-action cases on the new code.
Browser Lab's unused cancellation/access fixtures are available for fresh positive
manual tests. Never reset shared fixtures to disguise already-applied effects.
