# Planning sources and implementation boundaries

The Handled Notion hub and its linked planning/reference pages were read for this starter on **14 October 2026**. Documentation describes intent; source, tests, migrations and deployed evidence establish actual behavior. Do not infer that a feature exists from a Notion page or schema filename.

| Source                                                                                            | Role                                                                          |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| [Handled hub](https://app.notion.com/p/3f24ab5df14481e7875bdb241eff1529)                          | Current source entry point                                                    |
| [00 Canonical Master Plan / Decisions](https://app.notion.com/p/3f94ab5df14481ca9e8cf25219e10442) | Approved MVP scope, ownership, ADRs and Jira as primary task board            |
| [01 Ownership / Data / Security](https://app.notion.com/p/3f94ab5df144812c9efdde1a3ffd96f0)       | Tenant constraints, shared wire contracts and schema owners                   |
| [02 Commercial SaaS Roadmap](https://app.notion.com/p/3f94ab5df144818d99efd21f29015350)           | Future design; excluded from starter/MVP implementation                       |
| [03 Release Gates / Test Matrix](https://app.notion.com/p/3f94ab5df1448151bbb0e7814fddfb38)       | Evidence-based Done, owner/consumer reviews and negative tests                |
| [04 Technology Registry](https://app.notion.com/p/3f94ab5df14481309665c49786c67db8)               | Compatibility/version policy; inspect lockfile/build before upgrades          |
| [AI Instructions](https://app.notion.com/p/3f34ab5df14481749394f1b2252a4f80)                      | Full project handoff, subordinate to updated canonical decisions              |
| [Backend Blueprint](https://app.notion.com/p/3f24ab5df144818082f6f5132625a841)                    | Detailed API/error/module references; full inventory is not all current scope |
| [System Design / ERD](https://app.notion.com/p/3f34ab5df14481bd80d4f4284292b347)                  | Entity/relationship reference; schema work remains owner-reviewed             |
| [GitHub Collaboration](https://app.notion.com/p/3f14ab5df1448144b32dece0afaea37e)                 | Feature branches, meaningful commits and peer review                          |

## Changes applied to the starter

- Canonical health paths are `/health` and `/ready` outside the API prefix. Earlier repository paths are replaced; HTTP/OpenAPI tests cover the new paths.
- HTTP/error/response/validation/logging/security extension contracts are centralized. Feature modules are already registered; owners work locally in their modules.
- Existing API-only layout, Nest 12, Prisma 7, pnpm lockfile and Vitest workflow are preserved. The registry accepts compatible pinned Node 22; Node 24 and package-major migrations remain separate verified work.
- Default-deny HTTP auth/membership extension points are scaffolded. Real JWT/database membership behavior is not complete. No role slot/person is reassigned.
- Shared type contracts do not imply runtime jobs, Socket authorization, durable idempotency, evidence approval or real business tables are complete.
- No Docker, CI/CD, GraphQL, commercial connectors/billing or real refund execution is introduced.

## Jira traceability

- [SCRUM-88](https://team-singularity.atlassian.net/browse/SCRUM-88): NestJS/config/modules starter and shared HTTP infrastructure.
- [SCRUM-141](https://team-singularity.atlassian.net/browse/SCRUM-141): canonical health/readiness and configuration checks.
- [SCRUM-11](https://team-singularity.atlassian.net/browse/SCRUM-11): shared API/error/access slices; complete domain DTOs and owner review remain.
- [SCRUM-91](https://team-singularity.atlassian.net/browse/SCRUM-91): branch/review/commit docs; GitHub hosting protections need separate verification.
- [SCRUM-89](https://team-singularity.atlassian.net/browse/SCRUM-89): existing connection baseline; business migrations/seeds remain unimplemented.

Three golden flows, five AI capabilities, real auth/account security, business models, frontend integration, public deployment and release gates remain on the team backlog. External grading date, Resolve AI compatibility and persistent/free worker hosting remain unresolved in the canonical plan; this starter makes no new commitment about them.
