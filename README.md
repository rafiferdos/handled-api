# Handled API

Handled's modular NestJS REST backend uses strict TypeScript, Prisma 7 and
PostgreSQL/Supabase. The product sequence is ticket → scoped investigation and
policy evidence → human decision → simulated action → audit.

**Step 2 foundation is implemented:** real asymmetric JWT/current-session
verification, persisted profiles/workspaces/memberships/invites, scoped customer
and account reads, ticket/messages/assignment/customer verification, public
idempotent intake and concrete investigation/proposal persistence. Business
schema, migrations, repeatable synthetic fixtures and real-PostgreSQL tests are
included. Shared-database migration, hosted integration, providers, knowledge,
workers, action execution and frontend acceptance remain separate delivery steps.

Start with the [14-step backend roadmap](docs/solo-backend-steps.md),
[foundation setup and API guide](docs/backend-foundation-setup.md),
[configuration](docs/configuration.md), [contributing](CONTRIBUTING.md) and
[Notion source register](docs/planning-sources.md). The
[Lead contracts](docs/lead-contracts.md) also cover later orchestration APIs.

## First checkout

Use Node 22.23.3 and pnpm 11.25.0. Keep the compatible installed package majors.

```bash
git clone https://github.com/rafiferdos/handled-api.git
cd handled-api
nvm install
nvm use
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env
```

Configure the authorized PostgreSQL target with verified TLS. Read the setup
guide before applying a migration, setting runtime grants or seeding a shared
environment. Auth and public intake fail closed when their configuration is
absent. Redis/provider settings may stay empty for this foundation step.

```bash
pnpm db:validate
pnpm check
pnpm start:dev
```

| Endpoint                                           | Behavior                                            |
| -------------------------------------------------- | --------------------------------------------------- |
| `/api/v1`                                          | Legacy application information envelope             |
| `/health`                                          | Public process liveness                             |
| `/ready`                                           | Public database readiness; safe dependency failure  |
| `/api/v1/me`, `/api/v1/workspaces/...`             | Real authenticated foundation APIs                  |
| `/api/v1/public/workspaces/:workspaceSlug/tickets` | Guarded creation-only public intake                 |
| `/docs`, `/docs-json`                              | OpenAPI in development/test; disabled in production |

Private clients receive `{data, requestId}` or `{data, meta, requestId}`. Global
validation rejects unknown fields; safe error envelopes omit raw tokens,
connection strings and dependency stack traces. ADMIN/AGENT/VIEWER authority
always comes from current database membership, not JWT metadata.

## Development and verification

Branch from the current `testing` integration commit. Use small meaningful
commits, a focused PR targeting `testing`, applicable verification and PR merge.
The user authorizes solo dependency implementation; A/B/C/D remain module
boundaries. Update only Lead Jira items. Frontend work follows separately.

| Command                                 | Purpose                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `pnpm check`                            | Format, lint, types, units, isolated HTTP and production build                 |
| `pnpm test:db`                          | Explicit disposable PostgreSQL migration/service/HTTP/concurrency verification |
| `pnpm db:validate` / `pnpm db:generate` | Validate schema / generate Prisma Client                                       |
| `pnpm db:migrate:deploy`                | Apply reviewed migrations to the explicitly configured target                  |
| `pnpm db:seed`                          | Explicit scoped synthetic setup; refuses implicit mode/reset                   |
| `pnpm start:prod`                       | Run compiled server after build/migrations/configuration                       |

Default unit/HTTP tests skip `.env` and do not access a shared database. The DB
suite accepts only explicit loopback `handled_test` settings. See the setup
guide for the disposable PostgreSQL command, identity fixture limits and safe
seed instructions. Synthetic business records are not evidence of actual AI,
provider, worker or browser execution.

Inject the single DatabaseModule/PrismaService. Transaction callbacks contain
only database effects; known serialization conflicts have bounded retries.
Use concrete domain services and caller-owned transactions for cross-domain
writes. Immutable evidence/audit and tenant-aware SQL constraints complement
service authorization. Do not expose the private `handled` schema to browsers.

For startup/readiness failures, verify environment keys, target/grants,
migrations, network/TLS and the pinned runtime. Environment errors name keys and
types without printing supplied secrets. Never commit `.env` or bypass TLS.
