# Audit history

Business writers append immutable scoped events in their own transaction. VIEWER+ can read ticket audit; ADMIN can read workspace audit. Responses are paginated and exclude credentials, raw provider errors and private prompts. Action before/after history is read through the action API.

See the [core setup and recovery guide](../../../docs/backend-core-setup.md),
[verification evidence](../../../docs/backend-core-verification.md) and
[solo backend roadmap](../../../docs/solo-backend-steps.md). Historical A/B/C/D
labels are module boundaries under solo execution; only Lead Jira items are updated.
