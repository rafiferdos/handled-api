# Render hosted backend rollout

Prepared on **18 October 2026 (Asia/Dhaka)**. The deployment is pending; the
Blueprint alone does not establish a running API, worker, or queue.

## Verified workspace and current resources

The user confirmed **My Workspace**, `tea-db390a7lot8c73f11180`, through the
connected Render tool. The existing `handled-api` service is
`srv-db8gpj0m7kps73fq20ag`, Node runtime, Singapore, Free plan. Its linked branch
is still `development`, and live deploy `dep-db8gpj8m7kps73fq2130` serves commit
`e56351516d80d10df8eba8327b27b5ffc474dbf2`. No worker or Key Value instance exists.

Remote `testing` is `75d331b13d54a1817df72d74cd9294a9cd3ad63d`, containing the
merged backend core flows. Deploy the verified `testing` revision after this
configuration is merged; redeploying the existing branch would retain old code.

## Proposed resources and cost

| Resource         | Action                                                 | Compute plan | Published monthly baseline |
| ---------------- | ------------------------------------------------------ | ------------ | -------------------------- |
| `handled-api`    | Adopt the existing service; change source to `testing` | `0.5c-512mb` | USD 7                      |
| `handled-worker` | Create a separate continuous BullMQ worker             | `0.5c-512mb` | USD 7                      |
| `handled-redis`  | Create private persistent Key Value                    | `256mb`      | USD 10                     |
| Total            | One instance of each                                   |              | **USD 24/month**           |

Prices were read from the live [Render pricing page](https://render.com/pricing)
and plan IDs from the [compute reference](https://render.com/docs/compute-plans).
This is resource compute only: usage overages, taxes, any existing workspace
subscription, Supabase, and Gemini charges are separate. Account-specific billing
and credits are not exposed by the connected tools. Recurring spend is pending
user approval. A sleeping Free API would reduce compute to USD 17/month, but the
prepared Blueprint keeps all three resources continuously available.

The flat Blueprint deliberately adopts the verified API by name without moving
it into a new project/environment. All resources use Singapore and manual
deploys. Redis uses `noeviction`, `journal-snapshot`, and `ipAllowList: []`.
Both processes receive its internal URL through `fromService`; no localhost or
external Redis URL is copied from `.env`. Paid journal persistence can lose the
last second of writes on interruption; the PostgreSQL outbox remains canonical.

## Secret and database preparation

Non-secret runtime settings are defined directly on both services. Existing
service-level values take precedence over environment groups, so direct Blueprint
values prevent preserved legacy API settings from shadowing the intended runtime.
Node is pinned to 22.23.3; `packageManager` pins pnpm 11.25.0. Both builds include
development dependencies for Prisma generation and Nest compilation. The API
starts with `pnpm start:prod`, and the worker with `pnpm worker:prod`. The
180-second shutdown window accommodates the existing 120-second investigation
deadline and worker connection cleanup.

Before applying the Blueprint, merge these API environment keys securely from
the intended server configuration: `DATABASE_URL`, `SUPABASE_URL`,
`GEMINI_API_KEY`, and exact hosted `CORS_ORIGINS`. The worker references the first
three API variables. Preserve verified PostgreSQL TLS and the committed public
CA at `prisma/certs/supabase-ca.crt`. Never commit credentials or place the
migration-owner connection on the worker. Inspect existing auth override keys
and ensure issuer/JWKS match the selected Supabase project.

`sync: false` only prompts during initial Blueprint creation and does not update
existing services on later syncs. Explicitly merge secrets into the adopted API
before Apply; do not assume a Blueprint will replace its existing credentials.
Later secret rotations require updating the API and syncing the Blueprint to
refresh the worker references.

The configured target is Supabase project `ljtcdfyajgwqbbuntwoc`. Fresh read-only
inspection found **zero handled business tables**, no Prisma history, no
`handled.active_identity`, and no vector extension. TLS connectivity passed.
The current runtime connection uses privileged `postgres` with BYPASSRLS; review
and provision a restricted server credential before uploading it as runtime
configuration. Follow [the foundation guide](backend-foundation-setup.md) for
private identity ownership and runtime grants, and [the core guide](backend-core-setup.md)
for vector placement and the complete five-migration history.

Review the explicit target, backup/restore capability, migration ownership, and
runtime grants; then apply the reviewed migrations using the migration connection:

```bash
pnpm db:validate
pnpm db:migrate:deploy
pnpm exec prisma migrate status
```

The Blueprint does not run shared-database DDL or seed Auth users automatically.
Confirm 22 business tables, vector in `extensions`, the private identity function,
runtime business access, and denial of browser-role business access before
starting the worker. Do not reset, use `db push`, or run disposable DB tests on
this target.

The API generates a server-only support-form pepper. Public intake remains
disabled with `PUBLIC_INTAKE_ORIGINS=""` until exact hosted origins and the
Render reverse-proxy/client-IP policy have been reviewed. Configure those before
claiming hosted public intake works. `ACTION_SIMULATION=true` remains mandatory.

## Validation and application

Fresh local verification passed with Node 22.23.3 / pnpm 11.25.0:
`pnpm check` completed formatting, type-aware lint, typecheck, 139 unit tests,
37 isolated HTTP tests, and production build. HTTP tests require loopback
permission in this sandbox. The final Blueprint passed the current official
JSON Schema (draft 2020-12). Read-only configuration review found no remaining
issues. These checks do not validate a live deployment.

Render MCP is connected and supports resource inspection, web/Key Value creation,
environment merging, and deploy monitoring. This session's tool inventory has no
worker creation, service branch/plan update, Blueprint application, or billing
operation. Browser inventory is empty.

The checksum-verified official Render CLI 2.29.0 is available at
`/tmp/handled-render-cli/render`. It has no CLI login or `RENDER_API_KEY`;
connector OAuth does not authenticate the CLI. Authenticate with `render login`
through the normal Render authorization flow, or use a securely supplied
environment credential; never paste tokens into chat. Verify `render whoami`
and `render workspace current` before mutations.

```bash
render blueprints validate render.yaml \
  --workspace tea-db390a7lot8c73f11180 --output json
```

Local validation against the current official JSON Schema can check structure;
authenticated Render validation is still required to check live-resource conflicts
and platform semantics. Cost approval does not remove the CLI/Dashboard access
requirement.

After validation and the database gates, publish the feature PR into `testing`.
Open [the Blueprint creation page](https://dashboard.render.com/blueprint/new?repo=https://github.com/rafiferdos/handled-api)
in **My Workspace**, select **testing** as the Blueprint branch, and inspect the
resource diff before Apply. It must update `srv-db8gpj0m7kps73fq20ag` and create
only `handled-worker` and `handled-redis`. Stop if it proposes an extra API or a
different workspace/region. Confirm
the quoted plans before activating recurring charges.

For later releases, with manual deployments enabled, confirm API and worker
source revisions match and deploy each once. Capture the selected commit,
resource IDs, and deploy IDs. Do not trigger redundant deployments if an
automatic deployment has already started.

## Hosted acceptance

1. Wait for both deploys to become `live`; verify their actual commit IDs.
2. Request the API `/health` and `/ready`. `/ready` verifies database connectivity
   only; inspect worker logs and queue processing independently.
3. Run the real synthetic Gemini probe from the hosted environment. The fresh
   configured full probe again failed with `DEPENDENCY_TIMEOUT`; generation
   remains unverified. Model listing and embedding success alone are insufficient.
4. Use scoped verified Auth users and synthetic fixtures. Publish knowledge,
   observe persisted indexed chunks, admit an investigation, and verify the worker
   persists its real model result and citations.
5. Approve a current proposal as a human; verify one simulated business effect,
   action record, audit, and completed outbox record through REST refetch.
6. Repeat the approval/idempotency request and restart/redeploy the worker with
   in-flight work; verify recovery without duplicate effects and inspect logs.
7. After public-intake configuration, exercise the hosted origin/form-token path
   through persisted ticket and authenticated reads. Frontend acceptance remains
   a separate gate.

Retain failure evidence. A live deploy, 202 receipt, or Redis connection alone
does not prove the hosted business flow. Application rollback does not reverse
database migrations, queue deliveries, or business effects.
