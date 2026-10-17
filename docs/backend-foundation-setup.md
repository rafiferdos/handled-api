# Backend foundation setup

Step 2 implements the Auth/Workspace and Customer/Ticket dependencies plus Lead
persistence. Follow the [numbered roadmap](solo-backend-steps.md) for queues,
providers, knowledge, orchestration and actions. Frontend remains a later scope.

## Runtime and migrations

Use Node 22.23.3 and pnpm 11.25.0, install with the frozen lockfile and retain
verified TLS in remote connection settings. `DATABASE_URL` is the application
connection; `DIRECT_URL` is the reviewed migration connection. Business data
lives in private schema `handled`, outside Supabase's exposed Data API schemas.

The four migrations create 18 tables, composite tenant/customer/ticket/version
foreign keys, checks, partial active/current indexes, append-only history,
last-admin constraints, deny-by-default RLS and a private identity lookup.
No migration creates or changes Supabase-managed Auth tables or accounts.

For an explicitly approved target, review a backup and role ownership before:

```bash
pnpm db:validate
pnpm db:migrate:deploy
pnpm db:generate
```

Do not run `migrate dev`, `db push`, reset, or disposable tests against a shared
database. Merging into `testing` does not apply a shared migration or deploy.
Use the migration owner for DDL, not a browser or runtime credential. A deployed
backend needs these migrations before its private routes can work.

## Auth and runtime grants

Configure `SUPABASE_URL` (HTTPS). Issuer defaults to `<SUPABASE_URL>/auth/v1` and
JWKS to `<issuer>/.well-known/jwks.json`; optional overrides are trusted server
configuration. Audience defaults to `authenticated`. Without a base URL,
private authentication fails closed; endpoint overrides without a base URL fail
startup. Only asymmetric ES256/RS256 verification is supported. Rotate a legacy
HS256 project to asymmetric keys before enabling this resolver.

JWT signature, issuer, audience, expiry, subject and session UUID are verified.
Fresh identity requires the matching current `auth.sessions` row, a verified
email, no deleted/banned account and a nonexpired `not_after`. Mutations use `UnitOfWork.runAs`, check identity again before commit and take
session/account locks until transaction completion;
logout/revocation before admission is rejected. Membership and active workspace
are checked in the same transaction. Domain transactions use ReadCommitted with
a workspace lock acquired before membership/eligibility reads, plus version CAS
and SQL constraints. A pre-lock Serializable snapshot must not authorize a
post-lock mutation. All new scoped writers must follow this lock ordering.
Caller-owned Lead writers require an `IdentityTransaction` produced by `runAs`;
type and runtime binding prevent skipping the commit-time identity guard. JWT metadata never supplies roles.

`handled.active_identity(uuid, uuid)` is a private `SECURITY DEFINER` function,
with fully qualified managed tables, fixed `search_path`, no dynamic SQL and no
PUBLIC/anon/authenticated execution. Its migration owner must have SELECT and
row-lock privileges on `auth.users` and `auth.sessions`. PostgreSQL row-locking
SELECT also requires UPDATE permission; the function keeps those privileges
away from the API runtime role. It reads/locks and returns only UUID/email.

Provision the actual server role separately. It needs USAGE on `handled`, DML
privileges required by the services and EXECUTE on this identity function; it
does not need managed-Auth DML grants. Existing deny-by-default business RLS
requires the trusted server role to own the business tables or have reviewed
BYPASSRLS plus restricted schema/table grants. Do not give this role to a
browser; do not grant browser roles access to `handled`. Keep function ownership
with the privileged migration role, not a weaker runtime role. Example after
reviewing the real role name (this is not executed by setup):

```sql
GRANT USAGE ON SCHEMA handled TO handled_api;
GRANT EXECUTE ON FUNCTION handled.active_identity(uuid, uuid) TO handled_api;
-- Configure only the required business DML/ownership or BYPASSRLS separately.
-- Do not grant UPDATE on auth.users or auth.sessions to handled_api.
```

The disposable role test verifies lookup without managed-Auth access. Live
Supabase grants, Data API exposure and provider configuration still need checks
on the actual target; the local fixture is not a hosted Auth integration test.

Later frontend Auth uses Supabase sign-up/verification, sign-in, refresh,
password-reset redirect and logout. The API accepts Bearer access tokens only.
Email confirmation precedes `PUT /api/v1/me`; backend bootstrap takes its email
from verified Auth, never the body. Invitations are issued as one-time tokens;
this backend does not send invitation email. No password/reset/token material
belongs in logs, source, query strings or profile bodies.

## Core HTTP usage

All private routes require Bearer identity. Workspace routes use current ACTIVE
membership. ADMIN owns settings/membership/invites/form tokens; ADMIN/AGENT write
customers/tickets; VIEWER reads. Lists return `{data, meta, requestId}`; other
responses use `{data, requestId}`. DTOs reject unknown fields and inappropriate
nulls; updates use integer `expectedVersion`.

| Route under `/api/v1`                                                | Purpose                                                        |
| -------------------------------------------------------------------- | -------------------------------------------------------------- |
| `GET /me`, `PUT /me`                                                 | Read/idempotently bootstrap trusted profile                    |
| `POST /workspaces`, `GET /workspaces`                                | Create with first ADMIN / list memberships                     |
| `GET/PATCH /workspaces/:workspaceId`                                 | Scoped detail / versioned settings                             |
| `GET/PATCH /workspaces/:workspaceId/members[/:memberId]`             | List / role or status update                                   |
| `POST/GET /workspaces/:workspaceId/invites`                          | Issue token / safe list                                        |
| `POST /workspaces/:workspaceId/invites/:inviteId/revoke`             | Revoke pending invite                                          |
| `POST /invites/accept`                                               | Verified-email, single-use acceptance                          |
| `POST/GET /workspaces/:workspaceId/customers`                        | Create / filtered bounded list                                 |
| `GET/PATCH /workspaces/:workspaceId/customers/:customerId`           | Detail / versioned update or block                             |
| `GET /workspaces/:workspaceId/customers/:customerId/account-context` | Bounded payment/subscription/access projections with totals    |
| `POST/GET /workspaces/:workspaceId/tickets`                          | Idempotent create / filtered bounded list                      |
| `GET/PATCH /workspaces/:workspaceId/tickets/:ticketId`               | Detail / versioned metadata                                    |
| `GET/POST /workspaces/:workspaceId/tickets/:ticketId/messages`       | Bounded timeline / append public or internal message           |
| `PATCH /workspaces/:workspaceId/tickets/:ticketId/assignee`          | Active ADMIN/AGENT membership UUID or explicit null            |
| `POST /workspaces/:workspaceId/tickets/:ticketId/verify-customer`    | Explicit authenticated customer-identity attestation and audit |
| `PATCH /workspaces/:workspaceId/tickets/:ticketId/status`            | Allowed human closure edge only                                |
| `POST /workspaces/:workspaceId/support-form/token`                   | ADMIN token issue/rotation with expiry                         |
| `POST /public/workspaces/:workspaceSlug/tickets`                     | Public creation-only safe receipt                              |

`account-context` returns at most 50 of each account record type and exact
counts/limit, so consumers can detect incomplete history. Blocked customers are
not eligible for this account context. Money uses integer minor units/currency;
these are synthetic customer records, not Handled SaaS billing.

Ticket create and public intake require `Idempotency-Key` (1–128 allowed
characters; UUID recommended). Same scope/key/payload replays one committed
receipt; a changed payload conflicts. Receipt status is the original creation
status. Authenticated consumers refetch current detail. Append-only message
writes currently do not promise client-supplied deduplication.

## Public intake policy

Configure a random server-only `SUPPORT_FORM_TOKEN_PEPPER` of at least 32
characters and exact `PUBLIC_INTAKE_ORIGINS`. Missing configuration disables
intake. ADMIN issues a 32-byte random form token (1–720 hours, default 168);
only its HMAC persists. Deliver it to the later support form without treating it
as a customer login. Rotation/expiry invalidates old token receipts as well.

Public POST requires allowed `Origin`, `X-Support-Form-Token` and
`Idempotency-Key`. Submit only subject, body, requesterEmail and optional
requesterCustomerRef. The receipt reveals id/reference/status. Public hints
never create a verified customer association, private read permission or action
eligibility. Agent customer linking records explicit verification and cannot
change the customer during an active investigation.

Committed public creates are limited transactionally to five per IP/form-token
context and 100 per workspace in ten minutes. Existing valid receipt retries do
not consume a new slot. Only a peppered hash of IP/token is persisted. Global
in-memory throttling/body limits also apply. Express currently trusts the socket
address, not arbitrary forwarded headers; review the actual reverse proxy and
client-IP policy before public deployment. These controls do not claim a
production spam/challenge service.

## Repeatable synthetic fixtures

First provision four distinct, verified active Supabase Auth users through the
provider's authorized flow: Acme ADMIN, AGENT, VIEWER and a separate PixelDesk
ADMIN. This seed does not create Auth users, set passwords or send email.
Choose two fresh workspace UUIDs; these define deterministic UUIDv5 record IDs
and slugs `acme-cloud-<id-prefix>` / `pixel-desk-<id-prefix>`.

Set the six IDs and explicit scope flags in a local environment:

```bash
SEED_MODE=scoped
SEED_ALLOW_SCOPED=true
SEED_WORKSPACE_ID=<fresh-acme-uuid>
SEED_PIXEL_WORKSPACE_ID=<different-fresh-pixel-uuid>
SEED_ADMIN_USER_ID=<verified-acme-admin-uuid>
SEED_AGENT_USER_ID=<verified-acme-agent-uuid>
SEED_VIEWER_USER_ID=<verified-acme-viewer-uuid>
SEED_PIXEL_ADMIN_USER_ID=<verified-pixel-admin-uuid>
pnpm db:seed
```

These assignments must be exported or placed in the local `.env`. The connection
uses DATABASE_URL; inspect the explicit target before running. No default mode
or reset exists. The seed refuses mismatched workspace identity and missing/
unverified users. Re-running fills missing fixture records and preserves changed
roles, business statuses, messages and counters; it never resets unrelated data.
For a fresh rehearsal use new workspace UUIDs, not a shared reset.

Acme contains Maya/CUS-1001 with two 2900 USD settled payments PAY-9001/9002,
Daniel/CUS-1002 with active period-end cancellable SUB-1002, and
Sofia/CUS-1003 with settled PAY-9003 (1900 USD) plus revoked ACME_APP access due to
SYNC_ERROR. TKT-1001/1002/1003 use Notion's canonical subjects; period is October
2026 (ending 31 October 23:59:59 UTC). Seed-only identity mappings are explicitly
audited synthetic attestations. PixelDesk has its own admin and customer.
KB policy/embedding fixtures and actual AI/actions follow their roadmap steps.

## Local verification

`pnpm check` uses isolated HTTP/units and never loads a shared database.
`pnpm test:db` additionally needs explicit `TEST_DATABASE_URL`, accepts only
`127.0.0.1` with an explicit port, database `handled_test`, no URL query/hash,
and never falls back to `.env`. It generates, deploys migrations, then runs real
PostgreSQL service/HTTP tests. Tests create minimal managed-Auth column fixtures
only in this disposable database; application migrations do not own them.

Example with an available local PostgreSQL image:

```bash
docker run --rm -d --name handled-foundation-test \
  --tmpfs /var/lib/postgresql -p 127.0.0.1:55432:5432 \
  -e POSTGRES_USER=handled -e POSTGRES_PASSWORD=handled_test_only \
  -e POSTGRES_DB=handled_test postgres:18-alpine
TEST_DATABASE_URL=postgresql://handled:handled_test_only@127.0.0.1:55432/handled_test pnpm test:db
pnpm check
docker stop handled-foundation-test
```

The displayed password belongs only to the ephemeral test container. Never use
it for a hosted environment. Migration tests include nullable/same-tenant parent
mismatch, money, active runs, exact versions, immutable history, RLS/browser
role denial, current identity, role/tenant isolation, races and request rollback.
