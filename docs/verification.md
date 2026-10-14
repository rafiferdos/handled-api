# Starter verification — 14 October 2026

Runtime used: **Node 22.23.3**, **pnpm 11.25.0**, Prisma Client/CLI **7.10.0**. Dependency versions come from the existing frozen lockfile; it was not changed by the starter.

## Evidence

| Check                                                                      | Result                                                                          |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm db:validate`                                                         | Owner schema files and evaluation reservation valid; no business models created |
| `pnpm check` in working checkout                                           | Formatting, lint, typecheck, unit/HTTP tests and Nest build passed              |
| Clean source checkout, `pnpm install --frozen-lockfile`                    | 560 locked packages installed successfully; lockfile unchanged                  |
| `pnpm check` in clean checkout without `.env`                              | Complete gate passed: **36 unit tests + 28 HTTP E2E tests**                     |
| Compiled server `pnpm start:prod` using configured development environment | Started successfully and connected to the existing PostgreSQL database          |
| `GET /health` / `GET /ready`                                               | Both 200; readiness returned `database: connected` from a real read-only query  |
| `GET /api/v1` with `X-Request-Id: req_starter_smoke`                       | 200; response header and envelope echoed the correlation ID                     |
| Shutdown after smoke test                                                  | Temporary server terminated through its shutdown hooks                          |
| `git diff --check`                                                         | No whitespace errors                                                            |

The clean-checkout quality gate requires no live database: Prisma generation/compile and isolated HTTP tests work without developer credentials. Running the actual server still requires the configured database.

## Covered boundaries

HTTP cases cover request correlation, safe unexpected/Prisma/domain errors, success/list/204 responses, invalid query/body fields, missing/malformed idempotency headers, malformed JSON, payload limits, CORS/security headers, rate limits, private default-deny access, trusted membership/role test doubles and OpenAPI schemas. Production Swagger disabling is tested separately.

These results establish **starter readiness**, not a completed product or production release. Actual JWT/JWKS integration, business tenant-aware constraints/migrations, seed data, real provider/evaluation behavior, durable outbox/action idempotency, worker/Socket authorization, frontend golden flows and public deployment remain owner tasks.

GitHub hosting protection is a separate administration setting. The main branch's classic protection API reported `Branch not protected` during the read-only audit; the contributor guide describes the intended PR/review policy. Review hosting enforcement before normal team merges. The requester explicitly authorized this initial main-push delivery; no peer approval is claimed for it.
