# Investigation module

Concrete scoped InvestigationRun/Step lifecycle persistence.

Step 2 implements `InvestigationRepository` includes transactional admission, unique active runs, versioned transitions, bounded recorded steps and new-run retry lineage. `createInTransaction` permits future coordinator composition.

The existing DTO/contracts describe future HTTP orchestration. No investigation endpoint/worker or actual AI call is registered here yet.

See the [foundation setup/API guide](../../../docs/backend-foundation-setup.md),
[numbered backend roadmap](../../../docs/solo-backend-steps.md) and real DB tests in
`test/database`. A/B/C/D are retained module boundaries under the solo workflow.
Only Lead Jira items receive delivery updates.
