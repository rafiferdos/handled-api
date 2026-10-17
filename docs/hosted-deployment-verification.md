# Free hosted deployment verification

Verified **18 October 2026 (Asia/Dhaka)**. This records the approved Free preview;
full hosted AI/business acceptance is still pending.

## Live resources

- Workspace: `My Workspace`, `tea-db390a7lot8c73f11180`.
- API: `https://handled-api-zv4h.onrender.com/api/v1`.
- Existing web service: `srv-db8gpj0m7kps73fq20ag`, Singapore, **Free**.
- API and BullMQ worker run as separate supervised Node processes in that service.
- Redis-compatible Key Value: `red-db9t72vbtjjs73cvr4o0`, `handled-redis`, Singapore,
  **Free**, `noeviction`, persistence `off`, external IP allowlist empty.
- Supabase project: existing `ljtcdfyajgwqbbuntwoc`; no new managed database.
- [PR #7](https://github.com/rafiferdos/handled-api/pull/7) merged into `testing`.
  Application source: `8f0043396282fbaac024d05990b00c45060566a8`.
- Initial deploy `dep-db9tbh4s728c73cvakbg` reached `live` on that exact commit.
- Direct-Node runtime deploy `dep-db9tdt2jnfac73dirdeg` reached `live` on the same
  application commit.
- [PR #9](https://github.com/rafiferdos/handled-api/pull/9) merged the Gemini
  latency fix. Current deploy `dep-db9tnebncjis73akkib0` reached `live` at
  `2026-10-17T20:35:50Z`, with exact application source
  `9334b61ac54ca866b2eef5d683c6f9e0c6ac7240`. Public checks after it became live
  returned 200/200/401 for health/readiness/anonymous private access.

No paid resource, compute upgrade, workspace subscription, or provider billing
plan was activated. Account-wide build/bandwidth billing controls are not exposed
through the available tools; this is verification of Free resource plans.

## Public HTTP and runtime

| Request                            | Verified result                    |
| ---------------------------------- | ---------------------------------- |
| `GET /health`                      | 200, `status: ok`                  |
| `GET /ready`                       | 200, database connected            |
| Anonymous `GET /api/v1/workspaces` | 401, `UNAUTHENTICATED`             |
| Hosted-origin `OPTIONS /api/v1/me` | 204, exact frontend origin allowed |

Runtime secrets were merged and read back without printing their values.
`DATABASE_URL` uses the dedicated runtime login, verified TLS, and the committed
public CA. Redis uses its live internal URL, not local Redis. Public intake is
intentionally disabled (`PUBLIC_INTAKE_ORIGINS` empty). Actions remain simulated.

The first runtime used about 468 MiB of its 512 MiB limit at idle.
The service was changed to start `node dist/preview.js` directly, removing the
extra pnpm runtime process. The replacement instance sampled about 419 MiB after
startup. This is the same tested preview entrypoint; these samples are not a
load/capacity benchmark.

## Database access

All five reviewed migrations applied successfully; `prisma migrate status`
reported up to date. Verified 22 business tables, vector in `extensions`, and the
private identity function. A private pre-migration schema-only snapshot exists
locally; the handled business schema was empty before migration.

The user explicitly approved server role `handled_render_preview` with LOGIN,
BYPASSRLS and restricted handled-table DML/private-function execution. Its actual
login read business rows and invoked the identity function. Verification found:

- No direct SELECT/UPDATE on `auth.users` or `auth.sessions`.
- No postgres membership, superuser, CREATE ROLE, CREATE DATABASE or replication.
- No browser-role handled-table grants or identity-function execution.
- No migration-owner connection uploaded to the cloud runtime.

## Real hosted queue evidence

A labelled suspended workspace, `b33f329f-81cf-47e9-a09b-5827c63452e1`, is reserved for no-op
infrastructure smoke tests. These records contain no Auth users or customer data.
The target knowledge revision deliberately does not exist, so the real handler
returns without a model call or business effect. This is queue infrastructure
proof, not knowledge indexing or AI workflow proof.

| Outbox record                          | Outcome                                                                              | Attempts |
| -------------------------------------- | ------------------------------------------------------------------------------------ | -------- |
| `c394922d-17fb-4d2f-97fd-ed27e69e1f38` | Real outbox → hosted Redis/BullMQ → worker → persisted `PUBLISHED`                   | 1        |
| `f14445ed-21e3-4923-943a-d5c6bc23aed9` | Seeded missing delivery with expired DB lease → hosted worker reclaims → `PUBLISHED` | 2        |

Both completions cleared the execution token and lease. The second test seeds a
missing delivery; it does not prove a real Redis restart, in-flight AI recovery,
or absence of duplicate business effects.

After the replacement deployment and full old-instance drain/shutdown window,
new job `ec666d98-6f35-4f2c-afe2-f7b988d9b9b0` reached `PUBLISHED` at attempt 1,
with no remaining token/lease. Health/readiness remained 200 and anonymous private
access remained 401. Recent runtime logs had no matching worker-start,
queue-connection, outbox-dispatch, or supervisor-failure errors.

## Source checks and remaining gates

- Final `pnpm check`: formatting, type-aware lint, strict types, **144 unit/process
  tests**, **37 HTTP tests**, and production build passed on Node 22.23.3 /
  pnpm 11.25.0. One pre-existing unused-import lint warning remains.
- Five real child-process regressions cover failure, peer cleanup, signals,
  repeated signals, and a stuck child. An independent actual-entrypoint probe
  force-cleaned at 25 seconds with no surviving child PIDs.
- Authenticated Render Blueprint validation: `valid: true`, two resource actions.
- Independent source/configuration review: no remaining findings.
- Gemini follow-up: default-thinking direct generation timed out at 45 seconds;
  LOW returned HTTP 200 in 2.8 seconds. After explicitly selecting LOW for
  Gemini 3, the standard built provider probe passed real classification, two
  validated read-tool calls, and a 768-dimension embedding. These calls ran from
  the local verification environment against the real Free provider, not from
  the hosted worker. Cloud provider settings and the private key match the
  successful probe, verified without printing secrets. Follow-up `pnpm check`:
  147 unit/process + 37 HTTP tests pass. The fix is deployed as recorded above;
  this is not proof of hosted end-to-end AI/business processing.
- Real hosted policy indexing, investigation/citations, human approval, simulated
  effect/audit, duplicate effects, and frontend acceptance remain unverified.
- A 15-minute idle/wake exercise and a real Redis-data-loss exercise remain
  unperformed. Documented Free behavior sleeps both processes; Redis is volatile.

See [the rollout guide](render-deployment.md) for limits and operational details.
