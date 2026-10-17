# Free Render backend preview

The user approved **zero paid resources** on 18 October 2026 (Asia/Dhaka), and
approved running the API and BullMQ worker as separate Node processes in one Free
web service. This is a sleeping hosted preview, not a continuous worker host.

## Resources and limits

| Resource               | Render ID                      | Region           | Plan      |
| ---------------------- | ------------------------------ | ---------------- | --------- |
| Existing `handled-api` | `srv-db8gpj0m7kps73fq20ag`     | Singapore        | Free      |
| New `handled-redis`    | `red-db9t72vbtjjs73cvr4o0`     | Singapore        | Free      |
| Existing Supabase      | Project `ljtcdfyajgwqbbuntwoc` | Existing project | Unchanged |

The confirmed Render workspace is `My Workspace`, `tea-db390a7lot8c73f11180`.
No separate paid worker, paid Redis, compute upgrade, or workspace subscription
is authorized. All resources in [render.yaml](../render.yaml) explicitly use
`plan: free`. Never use a default compute plan when creating these resources.

[Render Free limits](https://render.com/docs/free) include:

- The web service sleeps after 15 minutes without inbound traffic. An API request
  wakes the service and both processes; cold startup can take about a minute.
- Jobs do not run while the service sleeps. There is no free continuous background
  worker plan. Do not add artificial keep-alive traffic to imply continuity.
- Free Redis is in memory only. Restart loses Redis state. Use `noeviction`,
  `persistenceMode: off`, and `ipAllowList: []`; PostgreSQL outbox rows remain the
  canonical work and effect record. Recovery after Redis loss still needs proof.
- The workspace shares 750 Free web-service hours per month, including its other
  existing Free services. It suspends Free services after exhausting those hours.
- Free web services have no SSH/one-off jobs or configurable shutdown delay.
- Build/bandwidth overages can be billed if the account has a payment method.
  Keep the build spend limit at zero and stay within included bandwidth. The
  public API/CLI used here does not expose account billing controls or payment
  methods, so an account-wide zero-charge guarantee cannot be verified here.

## Runtime

Render starts `node dist/preview.js` directly to avoid an extra package-manager
process in the 512 MB Free instance. `pnpm start:preview` runs the same entrypoint
for manual use. It supervises the existing
`dist/main.js` API and `dist/worker.js` worker as two child Node processes. A child
failure stops its peer and exits nonzero so Render can restart the service.
SIGTERM/SIGINT reach both children; after 25 seconds, unresponsive children are
killed. This fits the Free service's default 30-second shutdown budget. A long
investigation may be interrupted and must recover through the existing lease and
outbox protocol after wake/restart.

The separate `pnpm start:prod` and `pnpm worker:prod` commands remain available.
The API itself does not start a worker. `/ready` checks database connectivity;
it does not prove provider or queue health. Node 22.23.3 and pnpm 11.25.0 are
pinned; builds include development dependencies for Prisma/Nest. The Free preview
uses database pool size 2 per process and investigation concurrency 1.

Non-secret runtime values are specified directly on the service, so preserved
legacy service settings cannot override an environment group. Secrets use
`sync: false`; this only prompts during initial Blueprint creation, so existing
service values must be explicitly merged. Redis uses its internal service URL.
Never upload the local loopback Redis URL or the migration-owner database URL.

## Database and secrets

The deployment target was verified through PostgreSQL TLS with the committed CA.
Before migrations, it contained zero business tables, no Prisma history, no
private identity function, and no vector extension. A private schema-only snapshot
is at `/tmp/handled-premigration-schema.sql` (mode 0600); no handled business data
existed to export. This snapshot is local and is not a managed backup service.

Use the existing reviewed five migrations with the migration-owner connection:

```bash
pnpm db:validate
pnpm db:migrate:deploy
pnpm exec prisma migrate status
```

Provision a separate server login with only required handled-table privileges,
schema usage, reviewed RLS authority, and EXECUTE on
`handled.active_identity(uuid,uuid)`. Its credential belongs on Render only.
The private identity function stays owned by the migration role; runtime does not
receive direct managed-Auth access. Confirm 22 business tables, vector in
`extensions`, runtime access, and browser-role denial. Do not reset or use
`db push` on this project. See the [foundation guide](backend-foundation-setup.md)
and [core guide](backend-core-setup.md).

The explicitly user-approved runtime role is `handled_render_preview`, with LOGIN,
BYPASSRLS, no superuser/role-creation/database-creation/replication privileges,
USAGE on `handled` and `extensions`, SELECT/INSERT/UPDATE/DELETE on the existing
22 business tables (excluding migration history), and EXECUTE on the private
identity function. It receives no direct managed-Auth privileges or membership in
`postgres`. A generated password is kept private and uploaded only to this API.
The current application enforces tenant/role checks in its trusted backend;
BYPASSRLS lets this server role pass the business tables' default-deny RLS.
The actual login successfully read the business schema and called the identity
function. Verification confirmed no managed-Auth SELECT/UPDATE, no postgres
membership, no superuser/CREATE ROLE/CREATE DATABASE/replication, zero browser-role
business grants, and no browser identity-function execution. All five reviewed
migrations are applied; 22 business tables and vector in `extensions` are verified.

Merge runtime `DATABASE_URL`, `SUPABASE_URL`, `GEMINI_API_KEY`, exact hosted
`CORS_ORIGINS`, a server-only random `SUPPORT_FORM_TOKEN_PEPPER`, and the internal
`REDIS_URL` into the existing API environment. Preserve unrelated environment
keys. Keep verified TLS and the committed CA path. Do not print or commit secrets.

`PUBLIC_INTAKE_ORIGINS` stays empty pending review of the hosted form and reverse
proxy/client-IP policy. Public intake is therefore disabled. The existing
frontend origin can be allowed for authenticated browser calls without claiming
that frontend integration is complete. `ACTION_SIMULATION=true` is mandatory.

## Deploy and verify

The connected MCP tools can create Free Key Value, merge environment variables,
trigger a deploy, and inspect logs. The user also completed official CLI
2.29.0 authorization; CLI state is private under `/tmp/handled-render-auth`.
Verify the selected workspace before changes. The CLI supports service branch,
build, start, and plan updates. The root Blueprint records the intended settings;
CLI/MCP changes must match it. No Blueprint-managed association is claimed until
it is created through Render's Dashboard.

```bash
render blueprints validate render.yaml \
  --workspace tea-db390a7lot8c73f11180 --output json
```

The revised Free Blueprint passed authenticated Render validation. Publish the
reviewed feature PR into `testing`, update the existing API's branch/build/start
settings, merge the required environment values, and trigger one deployment.
Capture its ID, wait for `live`, and verify the actual source commit. Never
redeploy the old `development` branch or create a duplicate API unnecessarily.

Verify `/health`, `/ready`, both child processes in logs, the private Redis
connection, schema readiness, anonymous denial on real private routes, and worker
restart/recovery. Five real child-process tests cover peer crash, signal forwarding,
repeated signals at the actual entrypoint, and forced shutdown. The final
`pnpm check` passed: 144 unit/process tests, 37 HTTP tests, types, lint, formatting,
and production build. Independent review verified forced cleanup at 25 seconds
with no surviving child PIDs and has no remaining findings.

The configured real Gemini probe currently fails `DEPENDENCY_TIMEOUT`.
Generation, published policy indexing, investigation, human approval, simulated
business effects, duplicate-effect prevention after hosted restart, and frontend
acceptance remain separate gates until demonstrated. A live API or queue
connection alone does not establish these outcomes. No paid provider plan is
authorized by this deployment.
