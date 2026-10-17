# Billing module

Bounded payment, subscription and product-access reads.

Step 2 implements `BillingReadService.context` provides concrete projections, totals and a 50-row/type bound; no implicit provider mutation or SaaS billing endpoint.

Golden simulated business changes belong to the action step.

See the [foundation setup/API guide](../../../docs/backend-foundation-setup.md),
[numbered backend roadmap](../../../docs/solo-backend-steps.md) and real DB tests in
`test/database`. A/B/C/D are retained module boundaries under the solo workflow.
Only Lead Jira items receive delivery updates.
