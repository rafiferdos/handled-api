# Lead API and data contracts — Step 1

Status: **implemented contract-authoring slice; producer/consumer review pending**.
Primary Jira: [SCRUM-11](https://team-singularity.atlassian.net/browse/SCRUM-11).
Related: SCRUM-12, SCRUM-109, SCRUM-113 and SCRUM-115.

These contracts follow the [14 October canonical plan](https://app.notion.com/p/3f94ab5df14481ca9e8cf25219e10442),
[data/security addendum](https://app.notion.com/p/3f94ab5df144812c9efdde1a3ffd96f0)
and [release gates](https://app.notion.com/p/3f94ab5df1448151bbb0e7814fddfb38).
The older [backend blueprint](https://app.notion.com/p/3f24ab5df144818082f6f5132625a841)
and [ERD](https://app.notion.com/p/3f34ab5df14481bd80d4f4284292b347)
provide supplemental field/tool references. Contract choices below need consumer
review before G0 freeze; no owner approval is implied.

## Implemented artifacts

- `src/modules/ai/contracts/`: shared bounds, strict model output, read-tool
  schemas/ports, lifecycle/role definitions, OpenAPI conversion and route catalog.
- `src/modules/investigation/dto/`: route/filter DTOs, empty-trigger validation,
  admission/summary/detail/recorded-step response models.
- `src/modules/proposal/contracts/`: three-action payload allowlist, immutable
  evidence snapshots and the server-only approved-command proposal.
- `src/modules/proposal/dto/`: exact-version edit/approve/reject/escalate requests
  and proposal/decision/action-admission responses.
- `test/lead-contracts.e2e-spec.ts`: isolated HTTP/OpenAPI contract fixtures.

No business controller, DI producer implementation, provider call, table,
migration, action or queue worker is registered by this slice. The shipped API
continues to expose only its existing information/probe endpoints. Schema/type
validity does not prove identity, evidence truth, durable admission or an effect.

## Backend endpoint inventory

Every path below is relative to `/api/v1`. UUID parameters use `workspaceId`,
`ticketId`, `investigationId` or `proposalId`. All are private, workspace-scoped,
**CORE contract proposals**. Future handlers use `@LeadEndpoint(name)` on a root
`@Controller()` and attach the corresponding `@Param`, `@Query` and `@Body` DTOs.
The decorator binds the route, roles, HTTP status and shared Swagger helpers.

| Operation                  | Method and path                                                         | Role        | Request                                              | Success data                                         |
| -------------------------- | ----------------------------------------------------------------------- | ----------- | ---------------------------------------------------- | ---------------------------------------------------- |
| `startInvestigation`       | POST `/workspaces/:workspaceId/tickets/:ticketId/investigations`        | ADMIN/AGENT | No body or `{}`                                      | 202 `{investigationId,status:QUEUED}`                |
| `listInvestigations`       | GET `/workspaces/:workspaceId/investigations`                           | VIEWER+     | page/limit, optional ticketId/status                 | 200 investigation summaries + shared pagination meta |
| `getInvestigation`         | GET `/workspaces/:workspaceId/investigations/:investigationId`          | VIEWER+     | Route only                                           | 200 run + recorded steps + nullable current proposal |
| `retryInvestigation`       | POST `/workspaces/:workspaceId/investigations/:investigationId/retry`   | ADMIN/AGENT | No body or `{}`                                      | 202 new run admission                                |
| `getInvestigationProposal` | GET `/workspaces/:workspaceId/investigations/:investigationId/proposal` | VIEWER+     | Route only                                           | 200 latest proposal + citations                      |
| `editProposal`             | POST `/workspaces/:workspaceId/proposals/:proposalId/edit`              | ADMIN/AGENT | expectedVersion, summary, replyDraft, recommendation | 201 new immutable proposal version                   |
| `approveProposal`          | POST `/workspaces/:workspaceId/proposals/:proposalId/approve`           | ADMIN/AGENT | expectedVersion, optional reason                     | 202 `{actionExecutionId,status:QUEUED}`              |
| `rejectProposal`           | POST `/workspaces/:workspaceId/proposals/:proposalId/reject`            | ADMIN/AGENT | expectedVersion + reason                             | 200 persisted human decision                         |
| `escalateProposal`         | POST `/workspaces/:workspaceId/proposals/:proposalId/escalate`          | ADMIN/AGENT | expectedVersion + reason                             | 200 persisted human decision                         |

All proposed Lead POST operations require `Idempotency-Key`; this includes the
canonical minimum of trigger/approval/retry and extends admission consistency to
edit/reject/escalate. Every response reuses `{data,requestId}`; lists additionally
include `{meta:{page,limit,total,hasNext}}`. Errors reuse the existing typed
`{error:{code,message,details},requestId,timestamp}` envelope.

GET of a missing/currently unavailable standalone proposal returns the existing
404 error; an investigation detail may include `proposal:null` before generation.
No response advertises an executed action when only queued admission is known.

## Version, retry and idempotency decisions proposed for review

1. All four decision/edit requests carry a positive safe-integer expectedVersion;
   strings, null, fractions and unknown fields are rejected. A stale version
   returns `409 PROPOSAL_VERSION_CONFLICT` before any effect.
2. Edit replaces the complete editable content and creates a new version. Clients
   cannot set actor, tenant, status, confidence or trusted sources. Server-side
   revalidation decides whether the new content is ready for approval.
3. Same scoped key + same canonical request hash replays the original saved
   admission/result. Another payload with that key returns `IDEMPOTENCY_CONFLICT`.
   Save the response in the same transaction; an HTTP header alone is insufficient.
4. Scope deduplication by workspace, authenticated actor, operation and target.
   Recheck current authorization before returning saved private results. D also
   needs business-effect uniqueness across different keys/approvals/worker retries.
5. Another key while an investigation is QUEUED/RUNNING returns
   `409 INVALID_STATE_TRANSITION`. Retry is for FAILED/NEEDS_REVIEW and creates a
   new run; it does not reopen the old run.
6. A transaction must bind the exact human decision/version, action admission,
   audit and outbox. `ApprovedActionAdmissionPort` is a proposed boundary, not a
   transaction implementation; the Lead/D transaction protocol is still a review
   gate. D must reload authoritative state rather than trust serialized metadata.

These are documented choices to review, not independently approved ADRs or
implemented durability guarantees.

## AI and action payload boundaries

`proposalOutputSchema` strictly validates the blueprint's category, summary,
confidence, missingFacts, recommendation, replyDraft and evidenceRefs. Unknown
keys are rejected, references must be unique, HIGH cannot have missing facts,
and a recommendation requires evidence references. A null recommendation is a
safe LOW-confidence/manual-review result rather than an invented action.
Validated proposals and nested evidence/fact/parameter collections are immutable.

Step 2 freezes the shared category taxonomy in Prisma's `TicketCategory`:
BILLING_DUPLICATE_CHARGE, SUBSCRIPTION_CANCELLATION, PRODUCT_ACCESS_ISSUE and OTHER.
The Zod output schema and response OpenAPI consume that same taxonomy.

| Allowed recommendation   | targetRef refers to             | Allowed params                                                  |
| ------------------------ | ------------------------------- | --------------------------------------------------------------- |
| REFUND_DUPLICATE_PAYMENT | The candidate payment reference | Positive safe-integer amountMinor + uppercase 3-letter currency |
| CANCEL_AT_PERIOD_END     | The subscription reference      | Strictly empty object; preserve stored period end               |
| RESTORE_PRODUCT_ACCESS   | The product-access reference    | Strictly empty object; derive product/eligibility server-side   |

Display/source refs such as `PAY-9002` are not real UUID primary keys. The server
must resolve them within the verified workspace and ticket's customer context.
Currency syntax is not currency/amount eligibility: compare actual stored facts.

LOW/conflicting evidence cannot execute. MEDIUM requires explicit human review;
HIGH does not bypass human approval. Admission and worker execution recheck the
current active membership/revocation policy, tenant, READY/latest version,
resolvable/current sources, current business facts and target eligibility. The
existing canonical duplicate-charge/cancel/access invariants remain mandatory.
REJECTED/CLOSED tickets cannot execute. Unknown outcomes reconcile before retry.

The server-only command carries decisionId, exact proposalVersion, actor and
membership IDs, resolved target UUID, scoped IDs, correlation and idempotency key.
It is never a public approval DTO or model tool input. A well-formed fabricated
command is still unauthorized until D rechecks authoritative stored state.

## Read tools and evidence

Only these five names are accepted:

| Tool                  | Model-controlled arguments                                    |
| --------------------- | ------------------------------------------------------------- |
| getCustomerProfile    | customerId UUID                                               |
| listCustomerPayments  | customerId UUID; optional ISO instant from/to with from <= to |
| getActiveSubscription | customerId UUID                                               |
| getProductAccess      | customerId UUID                                               |
| searchKnowledge       | Nonblank bounded query; topK integer 1–20, default 5          |

The caller supplies `ReadToolContext` separately from model arguments. Resolve
workspace/ticket/customer from verified context and check both tenant and
ticket-customer equality on every call. A UUID/type is not authorization. Model
arguments cannot supply workspace/status filters or expose arbitrary write tools.

`ReadTool<TName,TData>` leaves B/C's projection DTO to its owner. Each adapter must
provide a concrete runtime result schema using `readToolResultSchema(dataSchema)`;
there is no unvalidated `any` payload or invented producer implementation.

Sources retain typed refs, title/excerpt, observedAt and a SHA-256 content hash.
Knowledge sources additionally retain real document/chunk UUIDs, documentVersion
and nullable score. C searches only published tenant content; old snapshots remain
auditable after reindex/archive. Syntax cannot establish source truth: the runtime
must reconcile model evidenceRefs with trusted tool results and current versions.
Timeline DTOs expose recorded operations/outcomes, never private chain-of-thought.

## Validation and Swagger

HTTP requests use the shared strict Nest validation pipe and native DTO classes.
There is no implicit version coercion; optional fields reject explicit null unless
the contract explicitly permits it. Trigger/retry bodies use
`EmptyInvestigationBodyPipe` to reject extra model/body authority.

Zod 4 schemas supply model/tool/action structural validation and inferred native
TypeScript types. Complex Swagger fields derive from those schemas through the
official OpenAPI 3.0 emitter. Runtime `.readonly()` is removed from wire metadata;
it does not make an editable request field server-only. Nullable action unions use
an explicit OpenAPI 3.0 null-only branch. Cross-field Zod/policy rules are described
here and tested; a Swagger shape is not a substitute for runtime policy.

Implementation references: [Zod schemas](https://zod.dev/api),
[Zod JSON Schema](https://zod.dev/json-schema),
[Nest validation](https://docs.nestjs.com/techniques/validation),
[Nest OpenAPI](https://docs.nestjs.com/openapi/types-and-parameters).

## Consumer review and next dependency gate

| Reviewer | Required sign-off / later producer                                                                             |
| -------- | -------------------------------------------------------------------------------------------------------------- |
| A        | Identity/ACTIVE membership, role/revocation and Workspace/Profile relations                                    |
| B        | Ticket/customer relations, category taxonomy, scoped account projections and action target semantics           |
| C        | Published tenant search, immutable source/version/hash resolution and retrieval metadata                       |
| D        | Exact-version approved command, transaction coordination, durable idempotency/outbox/audit and queue admission |

No peer/consumer sign-off is claimed. Full SCRUM-11 contract freeze and SCRUM-12
real tenant-safety review remain open. Code-only microtasks stay In Review until
the relevant reviewer accepts their evidence.

Step 2's real schema, A/B foundation and Lead persistence now exist. The former
owner dependency pause is superseded by the requester's solo authorization.
Follow the [current backend roadmap](solo-backend-steps.md) and
[foundation setup](backend-foundation-setup.md). Actual queue/provider/knowledge
orchestration, public Lead endpoints and policy/action admission remain their
later numbered steps; persistence alone does not prove an AI/action result.
