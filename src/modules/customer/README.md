# Customer module

Scoped customer create/list/detail/update and blocking.

Step 2 implements `CustomerService` with concrete projections and current actor checks. Public email/externalRef is never proof of ownership.

Later read-tool adapters add policy/evidence provenance.

See the [foundation setup/API guide](../../../docs/backend-foundation-setup.md),
[numbered backend roadmap](../../../docs/solo-backend-steps.md) and real DB tests in
`test/database`. A/B/C/D are retained module boundaries under the solo workflow.
Only Lead Jira items receive delivery updates.
