# Provider evaluation

A versioned 22-case synthetic benchmark covers three golden cases and 19 negatives. The opt-in ai:evaluate CLI uses the configured real provider and reports independent capability checks, latency and observed successful-stage token usage. Limited reply grading requires human review; embedding/failed-attempt billing is unavailable. This is not DB/BullMQ/hosted acceptance and has no persisted run-history API. GET evaluations/cases is ADMIN scoped.

See the [core setup and recovery guide](../../../docs/backend-core-setup.md),
[verification evidence](../../../docs/backend-core-verification.md) and
[solo backend roadmap](../../../docs/solo-backend-steps.md). Historical A/B/C/D
labels are module boundaries under solo execution; only Lead Jira items are updated.
