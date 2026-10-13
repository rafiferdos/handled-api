# Handled API

NestJS backend for Handled support operations, using Supabase PostgreSQL and Prisma 7.

## Local setup

Requires Git and nvm. The repository selects Node 22; pnpm 11 requires Node 22.13 or later.

```bash
git clone https://github.com/rafiferdos/handled-api.git
cd handled-api
nvm install
nvm use
npm install -g pnpm@11.25.0
pnpm install --frozen-lockfile
cp .env.example .env
```

Ask the team lead for the development connection settings and fill `.env`. Keep real credentials in your local `.env` and deployment secrets; never commit them or put database credentials in frontend environment variables.

- `DATABASE_URL`: application connection. For this persistent NestJS development server, use the Supabase **Session pooler** URI from **Connect**, port 5432.
- `DIRECT_URL`: migration connection. Use the same Session pooler host and credentials for development, or a reachable direct connection. An empty value falls back to `DATABASE_URL`.
- `DATABASE_POOL_MAX`: maximum connections per application instance; starts at 5.
- `DATABASE_CONNECT_TIMEOUT_MS`: connection timeout; starts at 10000.
- `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL`: project and Auth endpoints for the AuthModule implementation. This database setup does not implement JWT authorization.

Keep TLS certificate verification enabled on remote database connections. The public Supabase CA certificate is included at `prisma/certs/supabase-ca.crt`. For this development database:

- Runtime `DATABASE_URL` uses `sslmode=verify-full&sslrootcert=prisma/certs/supabase-ca.crt`.
- Migration `DIRECT_URL` uses `sslmode=require&sslaccept=strict&sslcert=prisma/certs/supabase-ca.crt`.

These certificate paths are relative to the repository root. Copy the matching settings from the team lead's development configuration. Local PostgreSQL may use different TLS settings.

```bash
pnpm db:validate
pnpm typecheck
pnpm build
pnpm start:dev
```

The application loads `.env` automatically. Build, typecheck, start and test commands generate Prisma Client automatically.

- API: http://localhost:4000/api/v1
- Swagger: http://localhost:4000/docs (development only)
- Liveness: http://localhost:4000/api/v1/health
- Database readiness: http://localhost:4000/api/v1/health/ready

## Database structure and migrations

`prisma.config.ts` is detected automatically. It loads the entire `prisma/` directory, including the feature-owned files in `prisma/models/`. Add ERD models to those files. The generated client lives in `src/generated/prisma/` and stays out of Git.

The initial scaffold has no business models or committed migrations. The provisioned development database is ready for those models; this setup does not invent application tables.

The team lead creates and reviews migrations against a disposable local development database using `pnpm exec prisma migrate dev --name <change>`, then commits the migration files. To apply already committed migrations to the shared development database:

```bash
pnpm db:migrate
pnpm db:generate
```

Do not run reset or schema-changing development commands against the shared database. Supabase Auth's managed `auth` schema stays outside Prisma's application schema.

Supabase Data API is disabled for the provisioned project because the NestJS backend uses Prisma. Automatic RLS is enabled for future public tables. Feature modules still need workspace/tenant authorization in the backend.

## Shared database access

Inject `PrismaService` from `src/common/database/prisma.service.ts` into feature services. `DatabaseModule` exports one shared client with a bounded connection pool. It connects on application startup and disconnects during shutdown. `/health/ready` runs a real database query and returns 503 without exposing connection errors if the query fails.

## Updating an existing checkout

Start from a clean checkout; commit or stash your own work before switching branches.

```bash
git switch main
git pull --ff-only origin main
nvm use
pnpm install --frozen-lockfile
pnpm start:dev
```

Keep your existing `.env`; update it only when new environment settings are required. Feature work should use a branch such as `feat/SCRUM-13-investigation-api` and merge through a pull request.

## Verification

```bash
pnpm typecheck
pnpm build
pnpm test
pnpm test:e2e
```

E2E tests replace PrismaService and use isolated test settings; they do not connect to the shared database. Check `/api/v1/health/ready` to verify the live configured database.

## Production

Use a separate production Supabase project and deployment environment variables. Set `NODE_ENV=production`, apply reviewed migrations with `pnpm db:migrate`, build with development dependencies present, then run `pnpm start:prod`.

Reference: [Supabase Prisma guide](https://supabase.com/docs/guides/database/prisma), [Prisma 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [Nest configuration](https://docs.nestjs.com/techniques/configuration).
