Jira: <!-- Full issue URL -->
Owner slot / domain:
Scope / release gate:

## Change

<!-- State the concrete trigger/problem and resulting behavior. -->

## Validation

<!-- Commands run, meaningful negative/concurrency tests, and results. -->

## Integration and migration

<!-- Consumer/API contract changes, schema/migration ordering, rollback or backup plan, frontend/demo evidence. Write "None" when not applicable. -->

## Review

- [ ] Scope matches the Jira requirement and module owner
- [ ] Shared/cross-domain contract changes reviewed with producers and consumers
- [ ] Workspace, roles, input validation and safe errors covered where applicable
- [ ] Human approval, evidence and idempotency preserved where applicable
- [ ] Frontend loading/error/empty states use the real API where applicable
- [ ] `pnpm check` passes; no secrets or generated artifacts committed
- [ ] Peer review received before merge
