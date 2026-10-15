# Handled API

Team starter for Handled's modular NestJS REST backend: PostgreSQL/Supabase, Prisma 7 and strict TypeScript. Product flow: Ticket → scoped investigation and KB evidence → human decision → simulated action → audit.

**Starter status:** HTTP infrastructure, database connection/readiness and feature module boundaries are implemented. Business models/migrations/seeds, real JWT verification, membership persistence, ticket/KB/AI/action/queue/realtime features and deployment remain owner tasks. The shipped API has only application information and probes. Private routes deny access until the auth resolver is implemented.

Read [contributing](CONTRIBUTING.md), [ownership](docs/ownership.md), [feature development](docs/feature-development.md), [configuration](docs/configuration.md) and the [14 October Notion source register](docs/planning-sources.md).

The lead's [Step 1 API/data contracts](docs/lead-contracts.md) now provide tested DTOs, strict AI/read-tool/action schemas and reusable OpenAPI route metadata. Consumer review remains pending; these artifacts do not register business endpoints. Follow the [numbered backend execution plan](docs/team-lead-steps.md) for later implementation and dependency gates.

## First checkout

Requires Git and nvm. The existing runtime is Node 22 (>=22.13); pnpm is pinned to 11.25.0. The current plan permits compatible Node 22; Node 24 adoption belongs in a separate verified runtime change.

```bash
git clone https://github.com/rafiferdos/handled-api.git
cd handled-api
nvm install
nvm use
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env
```

Get development database connection settings from the team lead through the team's secure channel and fill `.env`. The starter requires a reachable PostgreSQL database; Redis/AI keys can remain empty until their feature owner enables those dependencies. Never commit real credentials.

```bash
pnpm db:validate
pnpm check
git switch -c feat/SCRUM-45-ticket-api
pnpm start:dev
```

Keep the terminal running and verify:

```bash
curl http://localhost:4000/health
curl http://localhost:4000/ready
curl http://localhost:4000/api/v1
```

| Endpoint              | Behavior                                                       |
| --------------------- | -------------------------------------------------------------- |
| `/api/v1`             | Starter information in `{ data, requestId }`                   |
| `/health`             | Public liveness: `{ "status": "ok" }`                          |
| `/ready`              | Public PostgreSQL readiness; safe 503 error if the query fails |
| `/docs`, `/docs-json` | Swagger UI/OpenAPI in development/test; disabled in production |

Health paths follow the updated canonical contract outside `/api/v1`. The previous `/api/v1/health` and `/api/v1/health/ready` paths are replaced. Redis readiness will be added with the worker implementation.

## Existing checkout

Commit or stash your work before switching branches. Keep your local `.env`; add only newly required keys from the template.

```bash
git switch main
git pull --ff-only origin main
nvm use
pnpm install --frozen-lockfile
git switch -c feat/SCRUM-<id>-<task>
pnpm check
pnpm start:dev
```

Normal feature work uses a branch → focused PR → peer review → merge. Use small meaningful commits. The module is already imported by `FeaturesModule`; add its own controllers/providers without editing shared bootstrap files.

## Shared infrastructure

- Global exception handler, typed error catalog and safe Prisma/native error mapping.
- Strict DTO validation, nested field errors, bounded pagination and response envelope.
- Request IDs, async request context, trace correlation and structured logs that omit raw headers/bodies/query strings/errors.
- Public/role/workspace/current-user decorators and a default-deny HTTP access guard. A replaces the `AccessContextResolver` provider with verified JWT/ACTIVE membership logic.
- Idempotency header admission and reusable Swagger response/error examples. Domain services still implement durable deduplication and transaction safety.
- Exact CORS allowlist, Helmet, body limits, per-process throttling and shutdown cleanup.
- Shared domain enums, tenant-scoped queue payloads and thin realtime event contracts.

Feature READMEs document the owner slot, dependencies and Jira entry points. No dummy business endpoint or seed is presented as complete.

## Database and migrations

Inject the single `PrismaService` from DatabaseModule. It uses a bounded `@prisma/adapter-pg` pool, verifies the database during startup and disconnects on shutdown. Every future business query must use verified workspace scope.

`prisma.config.ts` loads the entire `prisma/` folder, including owner files in `prisma/models/`. Generated client output is `src/generated/prisma/` and is ignored by Git. Build/typecheck/start/test scripts generate it automatically.

The lead coordinates owner-reviewed migrations against a disposable local database with `pnpm exec prisma migrate dev --name <change>`. Commit schema and migration together. Apply reviewed migrations to a shared environment with:

```bash
pnpm db:migrate:deploy
pnpm db:generate
```

Do not reset or run schema-changing development commands against the shared database. Supabase's managed auth schema stays outside application Prisma models. Keep tenant-aware foreign keys and backend authorization; database policies do not replace service/query checks. Seed implementation follows the owners' reviewed models.

## Commands and verification

| Command                                 | Purpose                                                     |
| --------------------------------------- | ----------------------------------------------------------- |
| `pnpm check`                            | Formatting, lint, typecheck, unit tests, HTTP E2E and build |
| `pnpm format` / `pnpm format:check`     | Shared formatting; skips generated/tool-owned files         |
| `pnpm test` / `pnpm test:e2e`           | Unit/HTTP checks using isolated test configuration          |
| `pnpm test:cov`                         | Unit coverage                                               |
| `pnpm db:validate` / `pnpm db:generate` | Validate schema / regenerate Prisma Client                  |
| `pnpm build` / `pnpm start:prod`        | Compile / run compiled server                               |

Default HTTP tests replace PrismaService, use test-only fixture controllers/resolver, and skip local `.env`; they never mutate the shared database. They verify common behavior, not real JWT, business tenant constraints, AI quality or durable worker/idempotency guarantees. Owners add those integration tests with their features.

## Production and troubleshooting

Use a separate production database and deployment secrets. Set `NODE_ENV=production`, apply reviewed migrations, build with development dependencies present, then run `pnpm start:prod`. Verify public app/API and always-running worker hosting before claiming release readiness. Deployment is not configured by this starter.

- Environment validation errors show variable names/types, not supplied secret values.
- Startup failure: check local connection/TLS settings, DNS/reachability and credentials; process logs stay generic.
- Readiness 503: the database query failed; check the configured dependency. Liveness is a separate process check.
- Private route 401: the default auth resolver denies tokens until Person A implements it.
- Unknown DTO field 400: use the documented DTO, not extra properties or implicit type conversion.
- Wrong Node/pnpm: run `nvm use` and install the pinned pnpm version before changing dependencies.

Official references: [Nest configuration](https://docs.nestjs.com/techniques/configuration), [exception filters](https://docs.nestjs.com/exception-filters), [authorization](https://docs.nestjs.com/security/authorization), [Supabase Prisma](https://supabase.com/docs/guides/database/prisma).
