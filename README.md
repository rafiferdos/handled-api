# Handled API

Handled's modular NestJS REST backend uses strict TypeScript, Prisma 7 and
PostgreSQL/Supabase. The product sequence is ticket → scoped investigation and
policy evidence → human decision → simulated action → audit.

**The backend core is connected:** real Auth/workspaces/customer/ticket intake,
published policy/vector indexing, configured Gemini/read tools, durable
investigations, immutable proposals, human decisions, three simulated actions,
audit/reporting and a 22-case provider benchmark. Business changes are real
transactional database effects; external actions remain simulated. Live Gemini
verification, shared migration/grants, hosted worker operation and deployed
acceptance remain explicit gates. Frontend follows separately.

Start with the [14-step backend roadmap](docs/solo-backend-steps.md),
[core setup and operation](docs/backend-core-setup.md),
[short Gemini setup](docs/gemini-quickstart.md),
[verification evidence](docs/backend-core-verification.md),
[foundation setup](docs/backend-foundation-setup.md),
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
absent. Investigation/indexing need the provider settings and a separately
running Redis-backed worker; the API alone does not process jobs.

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
| `pnpm worker:prod`                      | Run the compiled standalone outbox/BullMQ worker                               |
| `pnpm ai:probe`                         | Build and verify real configured generation/tool/embedding capabilities        |
| `pnpm ai:evaluate`                      | Build and run the opt-in 22-case provider benchmark                            |

Default unit/HTTP tests skip `.env` and do not access a shared database. The DB
suite accepts only explicit loopback `handled_test` settings. See the setup
guide for the disposable PostgreSQL command, identity fixture limits and safe
seed instructions. Synthetic business records are not evidence of actual AI,
provider or browser execution. The core DB suite includes actual Redis transport
checks when `TEST_REDIS_URL` is supplied; see the verification record for boundaries.

Inject the single DatabaseModule/PrismaService. Transaction callbacks contain
only database effects; known serialization conflicts have bounded retries.
Use concrete domain services and caller-owned transactions for cross-domain
writes. Immutable evidence/audit and tenant-aware SQL constraints complement
service authorization. Do not expose the private `handled` schema to browsers.

For startup/readiness failures, verify environment keys, target/grants,
migrations, network/TLS and the pinned runtime. Environment errors name keys and
types without printing supplied secrets. Never commit `.env` or bypass TLS.
