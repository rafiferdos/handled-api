# Hosted backend deployment handoff — 18 October 2026, Asia/Dhaka

## Connected-session continuation

Render resource tools are now available and authenticated. The user confirmed
`My Workspace` (`tea-db390a7lot8c73f11180`). Live inspection confirms the existing
API is still Free/Singapore/`development`, with live commit `e563515`; no worker
or Key Value instance exists. Remote `testing` remains `75d331b`.

The proposed [root Blueprint](../render.yaml) adopts that API and adds the separate
worker and persistent private Redis in Singapore. Published compute is USD 24/month
(7 API + 7 worker + 10 Redis), pending spending approval. No paid resource or
cloud mutation has been performed. See [the rollout guide](render-deployment.md)
for exact resources, secret wiring, database gates, access limits, and acceptance.

Fresh read-only Supabase inspection still finds zero business tables, no migration
history, no private identity function, and no vector extension. The configured
runtime credential is privileged `postgres`; runtime role review remains required.
The official Render CLI 2.29.0 is installed in `/tmp/handled-render-cli/render`,
but its validation command requires CLI login. Connector OAuth works independently.
The connector has no worker creation or Blueprint-apply tool, and browser inventory
is empty. Use authorized CLI access or the prepared Dashboard flow for those steps.

`pnpm check` passed on Node 22.23.3 / pnpm 11.25.0, including 139 unit and 37 HTTP
tests plus build; HTTP tests needed sandbox loopback permission. Final Blueprint
official-schema validation passed, and read-only configuration review has no
remaining findings. The real configured Gemini probe again returned
`DEPENDENCY_TIMEOUT`. Hosted acceptance is still pending.

## Historical checkpoint before resource tools loaded

User wants cloud API + continuous worker + cloud Redis; local-only startup is not the objective. Existing user-approved source workflow: feature PR into testing, preserve meaningful commits, merge after verification; update only Lead Jira. User added Render plugin and explicitly reports Connected. Do not ask to install/connect again. Plugin installed state independently confirmed; its skills are available at /home/rafiferdos/.codex/plugins/cache/openai-curated-remote/app-6a624c56bfe081918f7544f7d58f6faf/1.0.2/. Current tool inventory has NO Render resource tools, and computer-use has no enabled browsers. Reload/new Codex session is needed, then discover Render tools, verify account/workspace and list services.

No paid resources, service changes, database migrations/grants or cloud secret uploads have been performed. Cloud deployment remains incomplete. No application code changes were made. Base is testing at 75d331b13d54a1817df72d74cd9294a9cd3ad63d; current work is on chore/SCRUM-17-hosted-deployment. Remote testing matches the base. Remote development is still e56351516d80d10df8eba8327b27b5ffc474dbf2; do not deploy that old source. Existing preview from Notion: https://handled-api-zv4h.onrender.com; service srv-db8gpj0m7kps73fq20ag, historical Singapore region and development branch. Reinspect actual live settings after Render access loads.

Fresh preflight:

- Production build passed using pinned Node22.23.3/pnpm11.25.0. Default pnpm failed read-only engine store; working command sets npm_config_manage_package_manager_versions=false and invokes cached pnpm/bin/pnpm.cjs using the pinned Node. Cached path: /home/rafiferdos/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pnpm/bin/pnpm.cjs.
- Configured Supabase runtime connection/TLS succeeds. Actual target has ZERO of the 22 business tables, NO migration history, NO pgvector extension, NO handled.active_identity function. Read-only inspection only; do not call this workflow-ready.
- Supabase public JWKS: HTTP200, one ES256 key.
- GEMINI_API_KEY exists, preserved without printing. Configured gemini-3.8-flash and gemini-embedding-2 are available in authenticated models listing (HTTP200).
- Full production ai:probe fails DEPENDENCY_TIMEOUT. Tiny direct generation request times out after15s; installed SDK gets HTTP504 after~14s. Thus key/model discovery works but generation is NOT verified. Diagnostics used only synthetic data. Configured gemini-embedding-2 returned HTTP200 and exactly768 dimensions in a direct synthetic request. Generation with the separate older gemini-2.5-flash name returned404; no model/configuration was changed. Generation with the selected model remains unverified.
- Local Redis handled-dev-redis, persistent volume handled-dev-redis-data, loopback6379/DB0, was started in prior turn. .env Redis URL is still local, not a hosted connection. Do not pass this local URL to cloud services.
- PUBLIC_INTAKE_ORIGINS and SUPPORT_FORM_TOKEN_PEPPER are absent, so public intake is disabled pending proper hosted configuration.

Hosting requirements and authorization:

- User explicitly authorizes hosted setup/deployment; do not keep asking to perform it. No monthly budget/payment authorization has been given. Resolve actual cloud plans/costs before activating recurring paid resources.
- Existing architecture is Nest API and a separate BullMQ worker; keep that architecture. Render Free sleeps and has no free continuous worker. Free Key Value has no persistence; use noeviction and durable paid persistence for an always-on setup. Official Render sample estimates starter compute7USD + persistent Redis10USD; exact current plans and account billing must be checked (new plan IDs include 0.5c-512mb and Key Value256mb).
- Render deploy skill selects Blueprint for multi-service API/worker/KeyValue and requires current docs, access/workspace discovery and validation. Do not invent workspace or adopt/overwrite legacy service names before inspection. API uses pnpm start:prod; worker uses pnpm worker:prod. Build includes dev dependencies and pinned toolchain. Same region; Redis internal connectionString wiring; public Redis access should stay disabled. Existing Supabase is reused, no second Postgres needed.
- Read and follow render-deploy and render-mcp skills; render-access reference and current official MCP docs already read. Current hosted MCP documented at https://mcp.render.com/mcp. CLI fallback needs OAuth or RENDER_API_KEY; no Render/Upstash/Railway/Vercel API token is in this repo environment. Never print/upload secrets to Git or chat.

Next: after tool reload, list Render workspaces/services and inspect existing source/env/build/billing. Prepare/validate concrete Blueprint and required env configuration, get only necessary paid-cost approval, apply reviewed migrations to the explicitly verified target within authorized deployment scope, verify provider generation/embeddings, deploy API/worker/cloud Redis and run actual hosted golden flows before claiming complete readiness.

Existing public Render check: /health and /ready each timed out at20seconds while cold startup may have been occurring. GET /api/v1/workspaces returned404 RESOURCE_NOT_FOUND. No serving SHA or latest private application functionality is verified.
