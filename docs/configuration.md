# Configuration

Copy `.env.example` to `.env` only for your first checkout. Existing developers retain their file and add template keys as needed. ConfigModule validates startup settings and skips the local file in tests. Never put database/provider secrets in frontend environment variables.

## Runtime settings

| Variable                      | Default / requirement                     | Use                                                              |
| ----------------------------- | ----------------------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                    | development; test/production allowed      | Production disables Swagger                                      |
| `PORT`                        | 4000                                      | HTTP listen port                                                 |
| `CORS_ORIGINS`                | http://localhost:3000                     | Comma-separated exact http/https origins, no wildcard/path/query |
| `HTTP_BODY_LIMIT_BYTES`       | 102400; 1024–1048576                      | JSON/form body admission limit                                   |
| `THROTTLE_LIMIT`              | 120                                       | Requests per route/client/window, per API process                |
| `THROTTLE_TTL_MS`             | 60000                                     | Rate-limit window in milliseconds                                |
| `DATABASE_URL`                | required PostgreSQL URI                   | Runtime connection                                               |
| `DIRECT_URL`                  | optional/empty falls back to DATABASE_URL | Prisma migrations                                                |
| `DATABASE_POOL_MAX`           | 5; maximum 20                             | Connections per API instance                                     |
| `DATABASE_CONNECT_TIMEOUT_MS` | 10000; minimum 1000                       | Pool connection timeout                                          |

The existing hosted development setup uses the Supabase Session pooler on port 5432 for a persistent Nest server. Get the matching host/user/password from the lead; do not invent a connection URL.

Keep TLS verification enabled remotely. The public CA certificate is `prisma/certs/supabase-ca.crt`. Existing development settings use:

- Runtime DATABASE_URL query: `sslmode=verify-full&sslrootcert=prisma/certs/supabase-ca.crt`.
- Migration DIRECT_URL query: `sslmode=require&sslaccept=strict&sslcert=prisma/certs/supabase-ca.crt`.

Paths are relative to the repository root, so run built servers from the root and include the public cert in the deployment artifact. Local PostgreSQL may use different TLS settings. A future hosted environment must verify its own connection/certificate configuration.

## Feature settings

Auth and public-intake runtimes are implemented by Step 2. Read the [foundation setup guide](backend-foundation-setup.md) for private identity function grants, token rotation and scoped fixture configuration. Provider/worker keys remain reserved for later roadmap steps.

| Keys                                                                                | Owner / contract                                                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`, `SUPABASE_JWT_ISSUER`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_AUDIENCE` | Auth; HTTPS trusted endpoints, audience defaults to authenticated                                        |
| `REDIS_URL`                                                                         | D; redis/rediss URI; configure durable worker deployment                                                 |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_EMBEDDING_MODEL`                          | Lead/C; optional server-side configuration; never hardcode model IDs                                     |
| `AI_PROVIDER`, `AI_MODEL`, `AI_PROMPT_VERSION`                                      | Lead; proposed provider-neutral keys; define precedence against provider-specific keys in the adapter PR |
| `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`                                                   | Lead; 30000 and 2 defaults, bounded by validation                                                        |
| `EMBEDDING_DIMENSION`                                                               | C; 768 only, matching the planned vector contract                                                        |
| `RAG_TOP_K`                                                                         | C; 5, maximum 20                                                                                         |
| `INVESTIGATION_CONCURRENCY`                                                         | Lead/D; 2, maximum 4                                                                                     |
| `ACTION_SIMULATION`                                                                 | D; true required, false rejected for MVP safety                                                          |
| `SUPPORT_FORM_TOKEN_PEPPER`                                                         | Ticket; private HMAC pepper, at least 32 characters; absent disables intake                              |

The tech registry prefers an environment-based provider abstraction; Resolve AI compatibility remains unverified. This starter does not call any model or promise a model/version/free quota. Do not enable real payment/provider writes by changing an environment flag.

For production-wide rate limiting or request tracing, add the appropriate shared store/trace implementation through a reviewed infrastructure change. The existing limiter is in-memory and traceId is a correlation ID; neither implies a distributed runtime is already configured.

`PUBLIC_INTAKE_ORIGINS` is a comma-separated exact origin allowlist. Empty disables intake. The public limiter uses persisted receipts across API processes (5/IP+form-token and 100/workspace per ten minutes); general throttling remains per-process. Express currently trusts the socket IP; review reverse-proxy handling before public deployment.
