# Profile / Workspace / Membership / Invite

Person A database slice. Source: the supplied
`handled_schemasketch_full_person_colors.dbml`, 16 October 2026. These four
models preserve its table names, column types, defaults, nullability, enum
values, indexes and internal foreign keys. No password or global role belongs
on Profile. No other owner's schema is changed.

## ERD links

```mermaid
erDiagram
    Profile o|--o{ Workspace : "createdByUserId (optional)"
    Profile ||--o{ Membership : userId
    Workspace ||--o{ Membership : workspaceId
    Membership o|--o{ Membership : "same-workspace inviter"
    Workspace ||--o{ Invite : workspaceId
    Membership ||--o{ Invite : "same-workspace creator"
    Profile o|--o{ Invite : acceptedByUserId
```

| Child / fields                            | Parent / fields                  | Purpose                                                                        |
| ----------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| Workspace.createdByUserId (nullable)      | Profile.id                       | Workspace creator identity                                                     |
| Membership.workspaceId                    | Workspace.id                     | Workspace exists                                                               |
| Membership.userId                         | Profile.id                       | Member identity exists                                                         |
| Membership.(workspaceId, invitedByUserId) | Membership.(workspaceId, userId) | Inviter belongs to the same tenant; nullable inviter allows initial onboarding |
| Invite.workspaceId                        | Workspace.id                     | Invite belongs to a workspace                                                  |
| Invite.(workspaceId, createdByUserId)     | Membership.(workspaceId, userId) | Invite creator belongs to the same tenant                                      |
| Invite.acceptedByUserId (nullable)        | Profile.id                       | Accepted identity exists                                                       |

Every relationship uses RESTRICT for updates/deletes. Membership exposes
unique (workspaceId,userId), (workspaceId,id), and (workspaceId,id,userId)
keys for tenant-safe references by other owners. Invite exposes
(workspaceId,id). Future commercial/connector models and their reverse links
are excluded from this Week 1 slice.
Other owners should add their own child models/relations with coordinated review,
not introduce duplicate Workspace or Profile definitions.

## SQL constraints and errors

`prisma/sql/profile-workspace-constraints.sql` supplies the exact ERD CHECKs
and pending-email expression index that schema comments alone cannot enforce:

- Profile email must be trimmed/lowercase; metadata must be an object.
- Workspace slug format, HTTPS website, public-form token requirement and
  object-shaped settings/metadata are enforced.
- DISABLED membership requires disabledAt; other statuses forbid it.
- Invite expiry follows creation. ACCEPTED requires both acceptance fields;
  other statuses forbid them. REVOKED requires revokedAt and other statuses
  forbid it.
- One PENDING invite per workspace and lower(email); historical invites and
  the same email in a different workspace are allowed. Stored token hashes
  remain globally unique. Never persist raw invitation secrets.
- updatedAt cannot precede createdAt. Defaults follow the ERD; services must
  explicitly update updatedAt on mutation.

The database tests verify constraint failures by SQLSTATE: 23503 foreign key,
23505 duplicate, 23514 CHECK, 23502 missing required data, and 23001 RESTRICT
on PostgreSQL versions that report it separately. Future API handlers must map
these using the shared exception layer, without exposing SQL or internal values.

The SQL supplement is **not an applied migration**. The lead must combine the
reviewed table DDL and this supplement in the team's first migration, preflight
existing invalid/duplicate rows, and apply them together. Do not deploy this
supplement before the tables exist. No shared or Neon database was modified.

## Auth and tenant boundary handoff

Profile.id is supplied by the authentication owner, not a database default.
That owner must verify identity before profile creation. If managed auth and
application data are in different databases (e.g. Supabase Auth and Neon), a
cross-database PostgreSQL FK is unavailable: trusted backend identity checks
and coordinated deletion/provisioning are required. If colocated, the auth
owner can coordinate a managed auth.users FK; no auth schema is created here.

A foreign key proves existence, not ACTIVE membership or allowed role. Services
must scope every operation by workspace, recheck ACTIVE membership/role and
revocation, verify invite expiry/status/hash and accepted-email ownership, and
perform acceptance/onboarding transitions atomically. Nullable compound inviter
references intentionally use PostgreSQL MATCH SIMPLE. RLS, grants and secured
API behavior remain separate integration work; these tests do not claim row-read
isolation. The creator of a workspace may be null or need not yet be a member,
as specified in the ERD, to allow initial membership creation without a cycle.

## Reproducible evidence

```powershell
pnpm exec prisma validate
$env:PROFILE_WORKSPACE_TEST_DATABASE_URL = 'postgresql://USER:PASSWORD@127.0.0.1:PORT/DISPOSABLE_DB'
node test/profile-workspace-schema.verify.mjs
```

The opt-in script requires an explicit localhost test URL, never loads .env or
DATABASE_URL, generates DDL from these four real schemas, and runs in a unique
schema inside a rolled-back transaction. It does not alter public application
tables. The four schemas are tested verbatim, including their real foreign keys;
the full project is independently checked by Prisma validation.

Local result: 30 database scenarios pass, covering valid transitions,
cross-tenant rejections, duplicate/token constraints, lifecycle and data checks.
Docker was unavailable; verification used a temporary PostgreSQL 18 cluster
bound to loopback, then stopped it. No production authentication/email calls occur.

PR cleanup verification: origin/development was fetched and the feature branch
was already up to date. The final diff contains only these four models, this
document, the SQL supplement and the database verification script. AuthModule
matches development, preserving its exported global deny-by-default resolver.
Supabase endpoints, duplicate Prisma/Profile services, future roadmap schemas,
extra auth packages, environment changes and Bun lockfile are excluded.
`pnpm check` passes: formatting, lint, typecheck, 111 unit tests, 37 E2E tests
and build. The test-only dependency-failure 503 log is expected. Node 24 was used
locally and warns because the repository specifies Node 22; CI and peer approval
are separate required evidence, not established by local checks.

Suggested daily update (not posted automatically):

- Done: four ERD models/tenant links checked; SQL constraint supplement and
  real PostgreSQL negative tests added.
- Next: lead/consumer schema review and combined migration; integrate secured
  services/API and UI under their own tasks.
- Blocker: shared migration application and reviewed PR evidence are pending.
- Evidence: Prisma validation; 30 local PostgreSQL scenarios; this document and
  the schema/SQL/test changes. No reviewed PR is claimed.
