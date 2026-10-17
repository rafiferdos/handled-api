# Simulated actions

ActionPolicy checks current policy, cited sources, human authority and scoped business eligibility at admission and execution. The processor atomically changes the eligible duplicate payment, renewal flag or exact product access with snapshots, status, audit and outbox completion. Effects are actual DB changes; external financial/provider writes remain simulated. ADMIN retry is bounded and OUTCOME_UNKNOWN requires manual reconciliation.

See the [core setup and recovery guide](../../../docs/backend-core-setup.md),
[verification evidence](../../../docs/backend-core-verification.md) and
[solo backend roadmap](../../../docs/solo-backend-steps.md). Historical A/B/C/D
labels are module boundaries under solo execution; only Lead Jira items are updated.
