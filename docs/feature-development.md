# Start a feature without rebuilding shared infrastructure

Read your module README, [ownership](ownership.md), the current Jira task and the [canonical plan](https://app.notion.com/p/3f94ab5df14481ca9e8cf25219e10442). Register controllers/services inside the existing feature module. Inject the one exported `PrismaService`; do not create another client/pool per module.

## HTTP contract

- Business API base: `/api/v1`; workspace routes use `/workspaces/:workspaceId/...`.
- `GET /health` and `GET /ready` are unprefixed public probes with raw success bodies. `/ready` currently checks PostgreSQL only; D adds Redis/worker checks when those dependencies are implemented.
- Ordinary controllers return domain data. The shared interceptor produces `{ data, requestId }`; return `paginated(items, total, query)` for `{ data, meta: { page, limit, total, hasNext }, requestId }`.
- `204` stays empty. Use `@RawResponse()` only for probes, downloads or streams. Avoid manual `@Res()` for ordinary JSON routes because it bypasses the common response path.
- Failures always use `{ error: { code, message, details }, requestId, timestamp }`. Throw `new AppException(ErrorCode.PROPOSAL_VERSION_CONFLICT)` or another catalog code. Native/Prisma exceptions are mapped centrally; raw messages/metadata are not returned.
- `@RequestId()` provides the HTTP correlation ID. `RequestContextService.get()` includes server-generated traceId and verified identity/workspace after the access guard. Pass those IDs explicitly into jobs; async local context does not cross Redis/process boundaries. These IDs are correlation fields, not an OpenTelemetry tracing implementation.

## Security extension points

The starter globally denies private endpoints until A supplies the real `AccessContextResolver` in AuthModule. It does **not** verify JWTs yet. A implements `authenticate(request)` using verified JWKS signature/issuer/audience/expiry, then `resolveMembership(userId, workspaceId)` using scoped ACTIVE database membership. Replace the existing provider; consumers need no bootstrap changes.

Private endpoints are the default. Use `@WorkspaceScoped()` on workspace controllers and `@Roles(WorkspaceRole.ADMIN, ...)` for allowed membership roles. `@CurrentUser()` returns verified identity; `@CurrentWorkspace()` returns the resolved membership, including workspaceId. Workspace params must be UUIDs. Never take authorization context from body/query/X-Workspace-Id or user-editable token metadata. Every service query, worker, vector query, export and Socket room must independently enforce the same workspace.

Use `@Public()` explicitly on public methods. Do not mark a mixed public/private controller public. Combining Public with workspaceId/role-scoped metadata is rejected as a route wiring error. Public ticket intake uses workspaceSlug, and B/A must add token/ownership/abuse policies: CORS is a browser allowlist, not authentication.

`@RequireIdempotencyKey()` validates a header and documents it; `@IdempotencyKey()` reads the admitted value. It does **not** persist keys, compare request bodies, deduplicate jobs or guarantee a single business effect. For public ticket creation, investigation, approval and retry, implement a tenant/operation-scoped unique key + request hash + saved result in the business transaction. D owns durable action/outbox handling. Reusing a key with a different payload returns `IDEMPOTENCY_CONFLICT`.

The default HTTP limiter is per-process/in-memory; production-wide protection needs a reviewed shared store/ingress policy. Health probes are exempt. Apply stricter route limits with Nest throttler decorators where appropriate. Do not trust all forwarded IP headers; configure only known proxies after deployment is verified.

## DTOs and OpenAPI

Use class DTOs with explicit `class-validator` rules and `@ApiProperty` / `@ApiPropertyOptional`. Unknown fields are rejected; implicit coercion is disabled. `PaginationQueryDto` handles explicit numeric query conversion (page 1, limit 20, maximum 100). Extend it for allowlisted domain filters. Validate provider/tools/job payloads at runtime; TypeScript interfaces alone cannot do that.

Decorate success responses with `@ApiSuccessResponse(ResponseDto, { status: 201 })` or `{ paginated: true }`. Use `@ApiErrorResponses(...)` for catalog codes. Error examples sharing one HTTP status are grouped automatically. Use `@ApiBearerAuth()` and document operation purpose/roles. Do not expose Prisma rows wholesale; map only authorized fields to response DTOs.

Example **pattern** for an owner-implemented service/DTO, not an existing ticket endpoint:

```ts
@ApiBearerAuth()
@WorkspaceScoped()
@Controller('workspaces/:workspaceId/tickets')
export class TicketController {
  constructor(@Inject(TicketService) private readonly tickets: TicketService) {}

  @Get()
  @Roles(WorkspaceRole.ADMIN, WorkspaceRole.AGENT, WorkspaceRole.VIEWER)
  @ApiSuccessResponse(TicketResponseDto, { paginated: true })
  @ApiErrorResponses(
    ErrorCode.UNAUTHENTICATED,
    ErrorCode.FORBIDDEN,
    ErrorCode.RESOURCE_NOT_FOUND,
    ErrorCode.VALIDATION_ERROR,
  )
  list(
    @CurrentWorkspace() membership: WorkspaceMembership,
    @Query() query: ListTicketsQueryDto,
  ) {
    return this.tickets.list(membership.workspaceId, query);
  }
}
```

Import shared helpers from their specific files under `src/common/`; put the owner-defined service/DTOs in the feature folder. The service applies workspace filters to both item and count queries, uses `paginationBounds(query)`, then returns `paginated(items, total, query)`. Review sorting and concurrent count consistency with the consumer.

## Tests and commit slices

Colocate service/domain tests as `*.spec.ts`. Add HTTP scenarios as `test/*.e2e-spec.ts` and call `configureApp(app)` before `app.init()`. The test environment skips local `.env`; replace PrismaService and external providers to isolate tests. No shared database reset/mutation in the default suite.

Foundation E2E controllers in `test/http-foundation.e2e-spec.ts` exercise the common pipeline only and are never registered in production. Their auth resolver is a test double, not real JWT evidence. Feature owners add real JWT, DB tenant/FK, worker/Socket, provider and business-idempotency integration tests when those features exist.

Use small deliverables: contract/schema → secured service/API → frontend integration → negative/concurrency tests → docs/demo proof. Each commit should represent one useful checkpoint; do not split changes just to inflate the count. Run `pnpm check` before review. Link the PR and test evidence in Jira; full feature Done includes real frontend/API integration and peer review.
